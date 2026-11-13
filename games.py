"""Game rules + 'teacher' answers used to train the worm brain's readout."""
from functools import lru_cache
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


# ---------------------------------------------------------------- Tic-tac-toe
# board: tuple of 9 ints, 1 = X, -1 = O, 0 = empty. X moves first.
LINES3 = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]


def ttt_winner(b):
    for a, c, d in LINES3:
        if b[a] and b[a] == b[c] == b[d]:
            return b[a]
    return 0 if 0 in b else 2  # 2 = draw


def ttt_turn(b):
    return 1 if b.count(1) == b.count(-1) else -1


@lru_cache(None)
def ttt_value(b):
    """Value for the player to move: 1 win, 0 draw, -1 loss."""
    w = ttt_winner(b)
    if w == 2:
        return 0
    if w:
        return -1  # previous player just won
    return max(ttt_move_values(b).values())


@lru_cache(None)
def ttt_move_values(b):
    t = ttt_turn(b)
    out = {}
    for i in range(9):
        if b[i] == 0:
            nb = b[:i] + (t,) + b[i + 1:]
            out[i] = -ttt_value(nb)
    return out


def ttt_features(b):
    t = ttt_turn(b)
    a = np.array(b) * t
    return np.concatenate([(a == 1), (a == -1)]).astype(float)


def ttt_dataset():
    seen, stack, X, Y = set(), [(0,) * 9], [], []
    while stack:
        b = stack.pop()
        if b in seen or ttt_winner(b):
            continue
        seen.add(b)
        mv = ttt_move_values(b)
        y = np.full(9, -1.5)
        for i, v in mv.items():
            y[i] = v
        X.append(ttt_features(b))
        Y.append(y)
        t = ttt_turn(b)
        stack += [b[:i] + (t,) + b[i + 1:] for i in mv]
    return np.array(X), np.array(Y)


# ---------------------------------------------------------------- Four in a row
ROWS, COLS = 6, 7


def c4_new():
    return np.zeros((ROWS, COLS), dtype=int)


def c4_legal(b):
    return [c for c in range(COLS) if b[0, c] == 0]


def c4_drop(b, c, p):
    nb = b.copy()
    r = max(r for r in range(ROWS) if nb[r, c] == 0)
    nb[r, c] = p
    return nb, r


def c4_wins(b, r, c):
    p = b[r, c]
    for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
        k = 1
        for s in (1, -1):
            rr, cc = r + dr * s, c + dc * s
            while 0 <= rr < ROWS and 0 <= cc < COLS and b[rr, cc] == p:
                k += 1
                rr += dr * s
                cc += dc * s
        if k >= 4:
            return True
    return False


def _windows():
    w = []
    for r in range(ROWS):
        for c in range(COLS):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                cells = [(r + dr * k, c + dc * k) for k in range(4)]
                if all(0 <= rr < ROWS and 0 <= cc < COLS for rr, cc in cells):
                    w.append(cells)
    return np.array(w)


WIN = _windows()
WR, WC = WIN[..., 0], WIN[..., 1]
SCORE = np.array([0, 1, 4, 16, 0])


def c4_heuristic(b, p):
    cells = b[WR, WC] * p
    mine, theirs = (cells == 1).sum(1), (cells == -1).sum(1)
    s = SCORE[mine][theirs == 0].sum() - SCORE[theirs][mine == 0].sum()
    return int(s) + 3 * int((b[:, 3] == p).sum())


def c4_negamax(b, p, depth, alpha=-1e9, beta=1e9):
    legal = c4_legal(b)
    if not legal:
        return 0
    if depth == 0:
        return c4_heuristic(b, p)
    best = -1e9
    for c in sorted(legal, key=lambda c: abs(c - 3)):
        nb, r = c4_drop(b, c, p)
        v = 1000 + depth if c4_wins(nb, r, c) else -c4_negamax(nb, -p, depth - 1, -beta, -alpha)
        best = max(best, v)
        alpha = max(alpha, v)
        if alpha >= beta:
            break
    return best


def c4_move_values(b, p, depth=3):
    out = {}
    for c in c4_legal(b):
        nb, r = c4_drop(b, c, p)
        out[c] = 1000 + depth if c4_wins(nb, r, c) else -c4_negamax(nb, -p, depth - 1)
    return out


def c4_features(b, p):
    a = b * p
    return np.concatenate([(a == 1).ravel(), (a == -1).ravel()]).astype(float)


def c4_target(vals):
    y = np.full(COLS, -1.5)
    for c, v in vals.items():
        y[c] = np.tanh(v / 40)
    return y


def c4_dataset(n_games, rng, depth=3):
    X, Y = [], []
    for _ in range(n_games):
        b, p = c4_new(), 1
        while True:
            vals = c4_move_values(b, p, depth)
            if not vals:
                break
            X.append(c4_features(b, p))
            Y.append(c4_target(vals))
            # mostly good moves, some random ones so the brain sees varied boards
            if rng.random() < 0.35:
                c = int(rng.choice(list(vals)))
            else:
                c = max(vals, key=vals.get)
            b, r = c4_drop(b, c, p)
            if c4_wins(b, r, c):
                break
            p = -p
    return np.array(X), np.array(Y)
