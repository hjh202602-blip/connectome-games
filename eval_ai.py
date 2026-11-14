"""Test my AI against the insect brains and the predictor: many rallies at once.

    python eval_ai.py          # 32 rallies of 60 seconds against each opponent
"""
import sys
import numpy as np
import ai
import paddle as pd
from games import pong_features
from train import load_or_train

N, FRAMES = 32, 3600


def brain_out(b, ball, side, me):
    bx, by, vx, vy, _ = pd.view(ball, side)
    X = np.stack([pong_features(*row) for row in zip(bx, by, vx, vy, me)])
    return b.predict(X)[:, 0]


def match(opp_name, rng):
    theta = np.load(ai.PATH, allow_pickle=True)["theta"][None]
    opp = None if opp_name == "예측 상대" else load_or_train(opp_name, "pong")
    ball = pd.serve(np.where(rng.random(N) < 0.5, 1, -1), rng, N)
    me, op = np.full(N, 0.5), np.full(N, 0.5)
    prev, target = np.zeros(N), np.full(N, 0.5)
    won = lost = hits = 0
    spin = []
    for t in range(FRAMES):
        out = ai.forward(theta, ai.features(ball, 1, me, op, prev)[None])[0][0]
        if opp is None:
            if t % 8 == 0:
                target = np.where(ball[:, 2] < 0, pd.predict_landing(ball, -1, 130), 0.5)
            o = np.clip((target - op) * 8, -1, 1)
        else:
            o = brain_out(opp, ball, -1, op)
        me, dme = pd.move(me, out)
        op, dop = pd.move(op, o)
        prev = out
        ball, scored, hit = pd.step(ball, op, me, dop, dme)
        won += (scored > 0).sum()
        lost += (scored < 0).sum()
        hits += (hit > 0).sum()
        spin += list(np.abs(ball[hit > 0, 4]) / pd.SPIN_MAX)
        if scored.any():
            new = pd.serve(np.where(scored > 0, -1, 1), rng, N)
            ball = np.where((scored != 0)[:, None], new, ball)
    return won, lost, hits, np.mean(spin) if spin else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    rng = np.random.default_rng(0)
    for name, label in (("worm", "꼬마선충"), ("fly", "초파리"), ("예측 상대", "예측 상대")):
        w, l, h, s = match(name, rng)
        rate = w / max(w + l, 1)
        print(f"내 AI vs {label}: {N}판 x 60초 동안 {w}점 얻고 {l}점 잃음 (득점 비율 {rate:.0%}), "
              f"받아친 공 {h}개, 친 공의 평균 회전 {s:.0%}", flush=True)
