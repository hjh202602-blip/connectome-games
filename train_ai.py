"""Train 'my AI' for paddle ball by practising on its own (evolution strategies).

    python train_ai.py v2           # 60 generations of v2 (continues where it left off)
    python train_ai.py v2 150       # number of generations
    python train_ai.py v1 300 --new # v1 from a random network

My AI moves its paddle exactly like the human (same push, friction and top speed).
It is rewarded for points, and a little for returns, for spin and for aiming the ball
(curve included) far from where the opponent's paddle is.
Every generation, slightly different copies of the network each play 8 rallies of
20 seconds, all at once. Copies that score more pull the network their way.

  v1: 64 copies. Opponents: 4x the 'predictor' (follows the curve exactly; hard to beat
      unless you hit fast, spinning, well-placed balls), 2x a straight-line guesser
      (ignores spin, like the insect brains), 2x the current AI itself.
  v2: starts from v1 and keeps learning against the real connectome brains:
      32 copies. Opponents: 2x worm brain, 2x fly brain, 2x predictor, 2x itself.
      The fly brain is slow (2,000 neurons), so in training it rethinks every 2nd frame.

The AI is saved every 10 generations to models/ai_paddle[_v2].npz and web/ai.js is
rewritten at the end; the game picks it up the next time you choose an AI mode.
"""
import sys
import time
import numpy as np
import ai
import paddle as pd
from games import pong_features

PRED, LINE, SELF, WORM, FLY = range(5)
NAMES = {PRED: "예측", LINE: "직선", SELF: "자기", WORM: "꼬마선충", FLY: "초파리"}
CONFIG = {
    "v1": dict(pop=64, games=[PRED] * 4 + [LINE] * 2 + [SELF] * 2, start=None, gens=150),
    "v2": dict(pop=32, games=[WORM] * 2 + [FLY] * 2 + [PRED] * 2 + [SELF] * 2, start="v1", gens=60),
}
FRAMES = 1200
SIGMA, LR = 0.04, 0.03
REACT = 8                      # the predictor rethinks every 8 frames
FLY_EVERY = 2                  # the fly brain rethinks every 2nd frame (speed)
RETURN_BONUS = 0.02            # small reward for each return, so a fresh net learns to hit
SPIN_BONUS = 0.04              # small reward for putting spin on a return (x spin fraction)
FAR_BONUS = 0.06               # reward for aiming far from the opponent's paddle: where the
                               # returned ball will land (curve included) vs where they stand
FAR_FULL = 0.4                 # this far away (40% of the court) earns the whole bonus


def brain_out(brain, ball, op):
    """Insect brain playing the blue side, for many rallies at once."""
    bx, by, vx, vy, _ = pd.view(ball, -1)
    X = np.asarray(pong_features(bx, by, vx, vy, op)).T
    return np.clip(brain.predict(X)[:, 0], -1, 1)


def play(thetas, opp_theta, games, rng, brains):
    """thetas (P, N) all play len(games) rallies. Returns per-candidate scores and stats."""
    P, G = len(thetas), len(games)
    shape = (P, G)
    kind = np.broadcast_to(np.array(games), shape)
    # same serves for every candidate so the comparison is fair
    srv = rng.uniform(-0.6, 0.6, (FRAMES, G))
    ball = pd.serve(np.where(rng.random(G) < 0.5, 1, -1), rng, G)
    ball = np.broadcast_to(ball, shape + (5,)).copy()
    me = np.full(shape, 0.5)       # the AI (orange side)
    op = np.full(shape, 0.5)       # its opponent (blue side)
    me_prev = np.zeros(shape)
    op_prev = np.zeros(shape)
    me_vel = np.zeros(shape)       # my AI moves with the human's inertia
    op_vel = np.zeros(shape)       # so does its copy when it plays itself
    target = np.full(shape, 0.5)
    o = np.zeros(shape)
    score = np.zeros(shape)
    points = np.zeros(shape)
    hits = np.zeros(shape)
    spin_sum = np.zeros(shape)
    far_sum = np.zeros(shape)
    has = set(games)
    for t in range(FRAMES):
        x = ai.features(ball, 1, me, op, me_prev, me_vel)
        out, _, _ = ai.forward(thetas, x)
        # opponents
        new_o = o.copy()
        if SELF in has:
            m = kind == SELF
            xo = ai.features(ball[m], -1, op[m], me[m], op_prev[m], op_vel[m])[None]
            new_o[m] = ai.forward(opp_theta[None], xo)[0][0]
        if PRED in has:
            m = kind == PRED
            if t % REACT == 0:
                target = np.where(ball[..., 2] < 0, pd.predict_landing(ball, -1, 130), 0.5)
            new_o[m] = np.clip((target[m] - op[m]) * 8, -1, 1)
        if LINE in has:
            m = kind == LINE
            bx, by, vx, vy, _ = pd.view(ball[m], -1)
            y = (by + vy * (1 - bx) / np.where(vx > 0, vx, 1)) % 2
            line = np.where(vx > 0, np.where(y > 1, 2 - y, y), 0.5)  # straight line, walls only
            new_o[m] = np.clip((line - op[m]) * 8, -1, 1)
        if WORM in has:
            m = kind == WORM
            new_o[m] = brain_out(brains["worm"], ball[m], op[m])
        if FLY in has and t % FLY_EVERY == 0:
            m = kind == FLY
            new_o[m] = brain_out(brains["fly"], ball[m], op[m])
        o = new_o
        me, me_vel, dme = pd.move_inertia(me, me_vel, out)
        op_d, dop = pd.move(op, o)
        if SELF in has:
            op_i, op_vel, dop_i = pd.move_inertia(op, op_vel, o)
            self_ = kind == SELF
            op_d, dop = np.where(self_, op_i, op_d), np.where(self_, dop_i, dop)
        op = op_d
        me_prev, op_prev = out, o
        ball, scored, hit = pd.step(ball, op, me, dop, dme)
        spun = np.where(hit > 0, np.abs(ball[..., 4]) / pd.SPIN_MAX, 0)
        far = np.zeros(shape)
        h = hit > 0
        if h.any():
            land = pd.predict_landing(ball[h], -1, 200)  # follows the spin's curve exactly
            far[h] = np.minimum(np.abs(land - op[h]) / FAR_FULL, 1)
        score += scored + RETURN_BONUS * h + SPIN_BONUS * spun + FAR_BONUS * far
        far_sum += far
        points += scored
        hits += hit > 0
        spin_sum += spun
        if scored.any():
            # serve towards whoever lost the point
            new = pd.serve(np.where(scored > 0, -1, 1), rng, shape)
            new[..., 2] = np.where(scored > 0, -1, 1) * pd.SERVE_V * np.cos(srv[t])
            new[..., 3] = pd.SERVE_V * np.sin(srv[t])
            ball = np.where((scored != 0)[..., None], new, ball)
    return score, points, hits, spin_sum, far_sum, kind


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ver = next((a for a in args if a in CONFIG), "v1")
    nums = [a for a in args if a.isdigit()]
    cfg = CONFIG[ver]
    gens = int(nums[0]) if nums else cfg["gens"]
    pop, games = cfg["pop"], cfg["games"]
    rng = np.random.default_rng()
    path = ai.path(ver)
    if "--new" not in sys.argv and ai.load(ver) is not None:
        theta, meta = ai.load_theta(path)
        print(f"저장된 학습 AI {ver}({meta['gens']}세대)에서 이어서 학습합니다.")
    elif cfg["start"] and ai.load(cfg["start"]) is not None:
        theta, meta = ai.load_theta(ai.path(cfg["start"]))
        meta = dict(meta)
        print(f"학습 AI {cfg['start']}({meta['gens']}세대)에서 출발해 {ver}를 만듭니다.")
    else:
        theta, meta = ai.init(rng), {"gens": 0, "games": 0}
        print(f"새 신경망으로 {ver}를 시작합니다.")
    meta["version"] = ver
    brains = {}
    if WORM in games or FLY in games:
        from train import load_or_train
        print("곤충 뇌를 불러옵니다...")
        brains = {"worm": load_or_train("worm", "pong"), "fly": load_or_train("fly", "pong")}
    print("상대: " + ", ".join(f"{NAMES[k]} {games.count(k)}판" for k in dict.fromkeys(games))
          + f" / 복사본 {pop}개", flush=True)
    m = np.zeros_like(theta)
    v = np.zeros_like(theta)
    half = pop // 2
    t0 = time.time()
    for gen in range(1, gens + 1):
        eps = rng.normal(0, 1, (half, ai.N_PARAMS))
        eps = np.concatenate([eps, -eps])
        score, points, hits, spin, far, kind = play(theta + SIGMA * eps, theta, games, rng, brains)
        fit = score.mean(1)
        # rank-based weights, robust to noisy scores
        ranks = np.empty(pop)
        ranks[np.argsort(fit)] = np.arange(pop)
        w = ranks / (pop - 1) - 0.5
        grad = w @ eps / (pop * SIGMA)
        m = 0.9 * m + 0.1 * grad
        v = 0.999 * v + 0.001 * grad ** 2
        theta = theta + LR * (m / (1 - 0.9 ** gen)) / (np.sqrt(v / (1 - 0.999 ** gen)) + 1e-8)
        meta["gens"] += 1
        meta["games"] += pop * len(games)
        if gen % 5 == 0 or gen == 1:
            per = " ".join(f"{NAMES[k]} {points[:, kind[0] == k].mean():+.2f}"
                           for k in dict.fromkeys(games) if k != SELF)
            sp = spin.sum() / max(hits.sum(), 1)
            fa = far.sum() / max(hits.sum(), 1)
            print(f"{meta['gens']:4d}세대 | 20초당 득실: {per} | 받아친 공 {hits.mean():.1f}개 | "
                  f"회전 {sp:.0%} | 상대에게서 먼 쪽 {fa:.0%} | {time.time() - t0:.0f}초", flush=True)
        if gen % 10 == 0 or gen == gens:
            np.savez(path, theta=theta, meta=np.array(meta, dtype=object))
    print("저장했습니다:", path)
    print("웹 버전에도 넣었습니다:", ai.export_js())


if __name__ == "__main__":
    main()
