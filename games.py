"""Game rules + 'teacher' answers used to train the brains' readout."""
import numpy as np

# ---------------------------------------------------------------- Paddle ball
# Field is 0..1 on both axes. The brain plays the right paddle at x = 1.

def pong_features(bx, by, vx, vy, py):
    return np.array([bx * 2 - 1, by * 2 - 1, vx * 40, vy * 40, py * 2 - 1, (by - py) * 2])


def pong_intercept(bx, by, vx, vy):
    if vx <= 0:
        return 0.5
    y = by + vy * (1 - bx) / vx
    y = y % 2
    return 2 - y if y > 1 else y


def pong_teacher(bx, by, vx, vy, py):
    return float(np.clip((pong_intercept(bx, by, vx, vy) - py) * 8, -1, 1))


def pong_dataset(n, rng):
    X, Y = [], []
    for _ in range(n):
        bx, by, py = rng.random(), rng.random(), rng.random()
        vx = rng.choice([-1, 1]) * rng.uniform(0.008, 0.02)
        vy = rng.uniform(-0.015, 0.015)
        X.append(pong_features(bx, by, vx, vy, py))
        Y.append([pong_teacher(bx, by, vx, vy, py)])
    return np.array(X), np.array(Y)
