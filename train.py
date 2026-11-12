"""Train each brain's readout for each game and save it to models/.

    python train.py                 # everything
    python train.py fly             # one brain, all games
    python train.py worm pong       # one brain, one game

main.py trains automatically the first time a model is missing.
"""
import os
import sys
import time
import numpy as np
from brain import Brain, get_wiring
import games as g

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")
SIZES = {"pong": (6, 1), "ttt": (18, 9), "c4": (84, 7)}
BRAINS = ("worm", "fly")


def path(key, game):
    return os.path.join(MODELS, f"{key}_{game}.npz")


def new_brain(key, game):
    return Brain(get_wiring(key), *SIZES[game], seed=7)


def save(brain, key, game):
    os.makedirs(MODELS, exist_ok=True)
    brain.save(path(key, game))


def train(key, game, log=print):
    rng = np.random.default_rng(1)
    t = time.time()
    if game == "pong":
        return train_pong(key, rng, t, log)
    X, Y = g.ttt_dataset() if game == "ttt" else g.c4_dataset(250, rng)
    brain = new_brain(key, game)
    brain.fit(X, Y)
    save(brain, key, game)
    log(f"{key} {game}: {len(X)} examples, {time.time() - t:.1f}s, "
        f"picks the teacher's best move {best_move_rate(brain, X, Y):.0%}")
    return brain


def pong_rollouts(brain, n, rng):
    """Let the brain (or the teacher, if brain is None) chase balls; record every state.
    Returns the states labelled with the teacher's answer and the brain's hit rate."""
    # all n balls are simulated side by side so the brain runs once per frame
    bx, by, py = rng.uniform(0, 0.5, n), rng.random(n), rng.random(n)
    vx, vy = rng.uniform(0.008, 0.02, n), rng.uniform(-0.015, 0.015, n)
    X, Y = [], []
    live = bx < 0.97
    while live.any():
        idx = np.where(live)[0]
        F = np.array([g.pong_features(bx[i], by[i], vx[i], vy[i], py[i]) for i in idx])
        T = np.array([g.pong_teacher(bx[i], by[i], vx[i], vy[i], py[i]) for i in idx])
        X += list(F)
        Y += [[t] for t in T]
        out = brain.predict(F)[:, 0] if brain else T
        py[idx] = np.clip(py[idx] + 0.018 * np.clip(out, -1, 1), 0.09, 0.91)
        bx[idx] += vx[idx]
        by[idx] += vy[idx]
        bounce = live & ((by < 0) | (by > 1))
        vy[bounce] *= -1
        by[bounce] = np.clip(by[bounce], 0, 1)
        live = bx < 0.97
    return X, Y, float(np.mean(abs(by - py) < 0.1))


def train_pong(key, rng, t, log):
    # DAgger: play with the current brain, label the situations it got into, retrain.
    X, Y = map(list, g.pong_dataset(20000, rng))
    brain = None
    for _ in range(5):
        x2, y2, _ = pong_rollouts(brain, 150, rng)
        X += x2
        Y += y2
        brain = new_brain(key, "pong")
        brain.fit(np.array(X), np.array(Y))
    save(brain, key, "pong")
    hit = pong_rollouts(brain, 300, np.random.default_rng(5))[2]
    log(f"{key} pong: {len(X)} examples, {time.time() - t:.1f}s, returns {hit:.0%} of balls")
    return brain


def best_move_rate(brain, X, Y):
    P = brain.predict(X)
    P[Y <= -1.5] = -np.inf
    pick = P.argmax(1)
    return float(np.mean(Y[np.arange(len(Y)), pick] >= Y.max(1) - 1e-9))


def load_or_train(key, game, log=print):
    if os.path.exists(path(key, game)):
        return Brain.load(get_wiring(key), path(key, game))
    return train(key, game, log)


if __name__ == "__main__":
    args = sys.argv[1:]
    keys = [a for a in args if a in BRAINS] or BRAINS
    games = [a for a in args if a in SIZES] or SIZES
    for k in keys:
        for gm in games:
            train(k, gm)
