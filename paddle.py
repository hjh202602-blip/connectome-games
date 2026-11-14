"""Paddle ball physics, shared by the game (main.py) and AI training (train_ai.py).

Everything works on numpy arrays so training can run thousands of rallies at once;
the game just passes arrays of length 1. web/game.js has the same rules in JavaScript.

Court: x runs 0..1 from the blue paddle (x = 0.03) to the orange paddle (x = 0.97),
y is sideways. A ball is [x, y, vx, vy, spin].
"""
import numpy as np

PH = 0.18              # paddle width
X_BLUE, X_ORANGE = 0.03, 0.97
SERVE_V = 0.01         # ball speed before spin
BRAIN_SPD = 0.018      # how far an AI/brain paddle may move per frame
PUSH = 0.4             # paddle speed added to the ball's sideways speed on a hit
CURVE = 0.012          # how hard spin bends the ball (Magnus effect)
SPIN_DECAY = 0.993     # spin lost per frame
SPIN_GAIN = 1.2        # paddle speed -> spin on a hit
SPIN_MAX = 0.05
VY_MAX = 0.03
SPIN_SPEED = 1.0       # full spin makes the ball (1 + SPIN_SPEED) times faster


def speed_factor(spin):
    """The more the ball spins, the faster it flies."""
    return 1 + SPIN_SPEED * np.minimum(np.abs(spin) / SPIN_MAX, 1)


def serve(d, rng, n=None):
    """New ball(s) from the centre towards d (+1 = orange, -1 = blue)."""
    a = rng.uniform(-0.6, 0.6, n)
    d = np.broadcast_to(d, np.shape(a))
    return np.stack([np.full_like(a, 0.5), np.full_like(a, 0.5),
                     d * SERVE_V * np.cos(a), SERVE_V * np.sin(a), np.zeros_like(a)], -1)


def step(ball, p_blue, p_orange, v_blue, v_orange):
    """Advance balls (n, 5) one frame. Paddles are already moved; v_* is how far each
    paddle moved this frame (that is what puts spin on the ball).
    Returns (ball, scored, hit) where scored is +1 if orange scored (ball passed blue),
    -1 if blue scored, else 0; hit is -1 / +1 for a blue / orange hit this frame."""
    bx, by, vx, vy, spin = (ball[..., k].copy() for k in range(5))
    vy = np.clip(vy - spin * CURVE, -VY_MAX, VY_MAX)  # curve
    spin = spin * SPIN_DECAY
    f = speed_factor(spin)
    bx = bx + vx * f
    by = by + vy * f
    wall = (by < 0) | (by > 1)
    vy = np.where(wall, -vy, vy)
    by = np.clip(by, 0, 1)
    spin = np.where(wall, spin * 0.7, spin)  # the wall rubs some spin off
    hit = np.zeros_like(bx)
    for px, py, side, pv in ((X_BLUE, p_blue, -1, v_blue), (X_ORANGE, p_orange, 1, v_orange)):
        h = ((bx - px) * side >= 0) & (vx * side > 0) & (np.abs(by - py) < PH / 2 + 0.01)
        vx = np.where(h, -vx, vx)
        vy = np.where(h, np.clip(vy + (by - py) * 0.06 + pv * PUSH, -VY_MAX, VY_MAX), vy)
        # same direction as the spin -> more spin; the other way -> less or reversed
        spin = np.where(h, np.clip(spin + pv * SPIN_GAIN, -SPIN_MAX, SPIN_MAX), spin)
        bx = np.where(h, px, bx)
        hit = np.where(h, side, hit)
    scored = np.where(bx < -0.02, 1, np.where(bx > 1.02, -1, 0))
    return np.stack([bx, by, vx, vy, spin], -1), scored, hit


def move(pos, out):
    """Move an AI/brain paddle by its output (-1..1). Returns (new pos, distance moved)."""
    new = np.clip(pos + BRAIN_SPD * np.clip(out, -1, 1), PH / 2, 1 - PH / 2)
    return new, new - pos


def view(ball, side):
    """The ball as seen by a player on `side` (+1 orange, -1 blue): mirrored so that
    every player thinks it sits at x = 0.97. Velocities include the spin speed-up."""
    bx, by, vx, vy, spin = (ball[..., k] for k in range(5))
    f = speed_factor(spin)
    if side < 0:
        bx, vx = 1 - bx, -vx
    return bx, by, vx * f, vy * f, spin


def predict_landing(ball, side, max_steps=400):
    """Where the ball will cross the paddle line on `side`, following the curve and the
    walls exactly (same maths as step(), without paddles). Used by the 'predictor'
    opponent in training."""
    shape = np.shape(ball)[:-1]
    b = np.asarray(ball, dtype=float).reshape(-1, 5)
    out = np.full(len(b), 0.5)
    idx = np.where(b[:, 2] * side > 0)[0]
    bx, by, vx, vy, spin = (b[idx, k].copy() for k in range(5))
    px = X_ORANGE if side > 0 else X_BLUE
    for _ in range(max_steps):
        if not len(idx):
            break
        vy = np.clip(vy - spin * CURVE, -VY_MAX, VY_MAX)
        spin = spin * SPIN_DECAY
        f = 1 + SPIN_SPEED * np.minimum(np.abs(spin) / SPIN_MAX, 1)
        bx = bx + vx * f
        by = by + vy * f
        wall = (by < 0) | (by > 1)
        vy[wall] = -vy[wall]
        spin[wall] *= 0.7
        np.clip(by, 0, 1, out=by)
        done = (bx - px) * side >= 0
        if done.any():
            out[idx[done]] = by[done]
            keep = ~done
            idx, bx, by, vx, vy, spin = idx[keep], bx[keep], by[keep], vx[keep], vy[keep], spin[keep]
    return out.reshape(shape)
