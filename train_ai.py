"""Train 'my AI' for paddle ball by practising on its own (evolution strategies).

    python train_ai.py              # 150 generations, continues from the saved AI if there is one
    python train_ai.py 300          # number of generations
    python train_ai.py 300 --new    # start over from a random network

Every generation, 64 slightly different copies of the network each play 8 rallies of
20 seconds, all at once:
  - 4 against the 'predictor', which follows the curve exactly and is hard to beat
    unless you hit fast, spinning, well-placed balls,
  - 2 against a straight-line guesser (like the insect brains: it ignores spin),
  - 2 against the current AI itself.
Copies that score more pull the network their way. The AI is saved every 10 generations
to models/ai_paddle.npz (and web/ai.js at the end); the game picks it up the next time
you choose an AI mode.
"""
import sys
import time
import numpy as np
import ai
import paddle as pd

POP, GAMES, FRAMES = 64, 8, 1200
SIGMA, LR = 0.04, 0.03
N_PRED, N_LINE = 4, 2          # the rest of the 8 games are against itself
REACT = 8                      # the predictor rethinks every 8 frames
RETURN_BONUS = 0.02            # small reward for each return, so a fresh net learns to hit
SPIN_BONUS = 0.04              # small reward for putting spin on a return (x spin fraction)


def play(thetas, opp_theta, rng):
    """thetas (P, N) all play GAMES rallies. Returns per-candidate score and stats."""
    P = len(thetas)
    shape = (P, GAMES)
    kind = np.zeros(GAMES, int)
    kind[N_PRED:N_PRED + N_LINE] = 1
    kind[N_PRED + N_LINE:] = 2
    kind = np.broadcast_to(kind, shape)
    # same serves for every candidate so the comparison is fair
    srv = rng.uniform(-0.6, 0.6, (FRAMES, GAMES))
    ball = pd.serve(np.where(rng.random(GAMES) < 0.5, 1, -1), rng, GAMES)
    ball = np.broadcast_to(ball, shape + (5,)).copy()
    me = np.full(shape, 0.5)       # the AI (orange side)
    op = np.full(shape, 0.5)       # its opponent (blue side)
    me_prev = np.zeros(shape)
    op_prev = np.zeros(shape)
    target = np.full(shape, 0.5)
    score = np.zeros(shape)
    points = np.zeros(shape)
    hits = np.zeros(shape)
    spin_sum = np.zeros(shape)
    for t in range(FRAMES):
        x = ai.features(ball, 1, me, op, me_prev)
        out, _, _ = ai.forward(thetas, x)
        # opponents
        xo = ai.features(ball, -1, op, me, op_prev).reshape(1, P * GAMES, ai.N_IN)
        self_out = ai.forward(opp_theta[None], xo)[0].reshape(shape)
        if t % REACT == 0:
            coming = ball[..., 2] < 0
            target = np.where(coming, pd.predict_landing(ball, -1, 130), 0.5)
        pred_out = np.clip((target - op) * 8, -1, 1)
        bx, by, vx, vy, _ = pd.view(ball, -1)
        y = (by + vy * (1 - bx) / np.where(vx > 0, vx, 1)) % 2
        line = np.where(vx > 0, np.where(y > 1, 2 - y, y), 0.5)  # straight line, walls only
        line_out = np.clip((line - op) * 8, -1, 1)
        o = np.select([kind == 0, kind == 1], [pred_out, line_out], self_out)
        me, dme = pd.move(me, out)
        op, dop = pd.move(op, o)
        me_prev, op_prev = out, o
        ball, scored, hit = pd.step(ball, op, me, dop, dme)
        spun = np.where(hit > 0, np.abs(ball[..., 4]) / pd.SPIN_MAX, 0)
        score += scored + RETURN_BONUS * (hit > 0) + SPIN_BONUS * spun
        points += scored
        hits += hit > 0
        spin_sum += spun
        if scored.any():
            # serve towards whoever lost the point
            new = pd.serve(np.where(scored > 0, -1, 1), rng, shape)
            new[..., 2] = np.where(scored > 0, -1, 1) * pd.SERVE_V * np.cos(srv[t])
            new[..., 3] = pd.SERVE_V * np.sin(srv[t])
            ball = np.where((scored != 0)[..., None], new, ball)
    return score, points, hits, spin_sum, kind


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    gens = int(args[0]) if args else 150
    rng = np.random.default_rng()
    meta = {"gens": 0, "games": 0}
    if "--new" not in sys.argv and ai.load() is not None:
        d = np.load(ai.PATH, allow_pickle=True)
        theta = d["theta"].astype(float)
        meta = d["meta"].item()
        print(f"저장된 AI({meta['gens']}세대)에서 이어서 학습합니다.")
    else:
        theta = ai.init(rng)
        print("새 신경망으로 시작합니다.")
    m = np.zeros_like(theta)
    v = np.zeros_like(theta)
    half = POP // 2
    t0 = time.time()
    for gen in range(1, gens + 1):
        eps = rng.normal(0, 1, (half, ai.N_PARAMS))
        eps = np.concatenate([eps, -eps])
        score, points, hits, spin, kind = play(theta + SIGMA * eps, theta, rng)
        fit = score.mean(1)
        # rank-based weights, robust to noisy scores
        ranks = np.empty(POP)
        ranks[np.argsort(fit)] = np.arange(POP)
        w = ranks / (POP - 1) - 0.5
        grad = w @ eps / (POP * SIGMA)
        m = 0.9 * m + 0.1 * grad
        v = 0.999 * v + 0.001 * grad ** 2
        step = gen  # Adam restarts each run
        theta = theta + LR * (m / (1 - 0.9 ** step)) / (np.sqrt(v / (1 - 0.999 ** step)) + 1e-8)
        meta["gens"] += 1
        meta["games"] += POP * GAMES
        if gen % 5 == 0 or gen == 1:
            pred = points[:, kind[0] == 0].mean()
            line = points[:, kind[0] == 1].mean()
            sp = spin.sum() / max(hits.sum(), 1)
            print(f"{meta['gens']:4d}세대 | 20초당 득실: 예측 상대 {pred:+.2f}, 직선 상대 {line:+.2f} | "
                  f"받아친 공 {hits.mean():.1f}개 | 친 공의 평균 회전 {sp:.0%} | {time.time() - t0:.0f}초", flush=True)
        if gen % 10 == 0 or gen == gens:
            np.savez(ai.PATH, theta=theta, meta=np.array(meta, dtype=object))
    print("저장했습니다:", ai.PATH)
    print("웹 버전에도 넣었습니다:", ai.export_js())


if __name__ == "__main__":
    main()
