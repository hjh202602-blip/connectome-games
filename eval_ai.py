"""Test my AI versions against the insect brains, the predictor and each other.

    python eval_ai.py          # 32 rallies of 60 seconds per pairing
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
    return b.predict(np.asarray(pong_features(bx, by, vx, vy, me)).T)[:, 0]


def match(ver, opp_name, rng):
    """my AI `ver` (orange) against opp_name (blue). Returns points won/lost, hits, spin."""
    theta = np.load(ai.path(ver), allow_pickle=True)["theta"][None]
    opp_theta = np.load(ai.path(opp_name), allow_pickle=True)["theta"][None] if opp_name in ai.VERSIONS else None
    opp = load_or_train(opp_name, "pong") if opp_name in ("worm", "fly") else None
    ball = pd.serve(np.where(rng.random(N) < 0.5, 1, -1), rng, N)
    me, op = np.full(N, 0.5), np.full(N, 0.5)
    prev, op_prev, target = np.zeros(N), np.zeros(N), np.full(N, 0.5)
    won = lost = hits = 0
    spin = []
    for t in range(FRAMES):
        out = ai.forward(theta, ai.features(ball, 1, me, op, prev)[None])[0][0]
        if opp_theta is not None:
            o = ai.forward(opp_theta, ai.features(ball, -1, op, me, op_prev)[None])[0][0]
        elif opp is not None:
            o = brain_out(opp, ball, -1, op)
        else:
            if t % 8 == 0:
                target = np.where(ball[:, 2] < 0, pd.predict_landing(ball, -1, 130), 0.5)
            o = np.clip((target - op) * 8, -1, 1)
        me, dme = pd.move(me, out)
        op, dop = pd.move(op, o)
        prev, op_prev = out, o
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
    label = {"worm": "꼬마선충", "fly": "초파리", "pred": "예측 상대", "v1": "내 AI v1"}
    vers = [v for v in ai.VERSIONS if ai.load(v) is not None]
    for ver in vers:
        opps = ["worm", "fly", "pred"] + (["v1"] if ver != "v1" else [])
        for o in opps:
            w, l, h, s = match(ver, o, np.random.default_rng(0))  # same serves for every pairing
            print(f"내 AI {ver} vs {label[o]}: {N}판 x 60초 동안 {w}점 얻고 {l}점 잃음 "
                  f"(득점 비율 {w / max(w + l, 1):.0%}), 받아친 공 {h}개, 친 공의 평균 회전 {s:.0%}", flush=True)
