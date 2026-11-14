"""Play paddle ball against a real connectome brain (worm or fly) or the trained AI,
or watch any two of them play each other."""
import numpy as np
import pygame as pg
import ai
import games as g
import paddle as pd
from train import load_or_train

W, H, GAME_W = 980, 640, 640
BG, FG, DIM = (18, 20, 28), (230, 232, 240), (120, 125, 140)
HUMAN_C, BRAIN_C = (90, 170, 255), (255, 150, 70)
FPS = 60

pg.init()
# SCALED keeps the 980x640 layout and stretches it to the monitor (mouse is mapped too)
screen = pg.display.set_mode((W, H), pg.FULLSCREEN | pg.SCALED)
pg.display.set_caption("Connectome Games - 진짜 뇌와 대결")
clock = pg.time.Clock()


def font(size, bold=False):
    for name in ("malgungothic", "applesdgothicneo", "nanumgothic", None):
        f = pg.font.SysFont(name, size, bold=bold)
        if f:
            return f


F_BIG, F_MID, F_SMALL, F_TINY = font(40, True), font(24, True), font(17), font(13)
F_MODE = font(18, True)
# who can play: insect brains and every version of the trained AI
PLAYERS = {"worm": ("꼬마선충", "C. elegans 뉴런 302개 전부 (Cook 2019)"),
           "fly": ("초파리", "FlyWire 초파리 뇌에서 잘라낸 뉴런 2,000개 회로 (2024)"),
           "v1": ("학습 AI v1", "혼자 연습해 회전 공을 읽고, 상대에게서 먼 쪽으로 휘어 치는 신경망"),
           "v2": ("학습 AI v2", "v1이 꼬마선충·초파리 뇌와 겨루며 더 배운 신경망"),
           "v3": ("학습 AI v3", "v2가 곤충 뇌, 그리고 v2 자신을 이기도록 더 크게 학습한 신경망")}
# menu tabs: (label, what the choice buttons pick)
TABS = [("사람 vs 곤충 뇌", ["worm", "fly"]),
        ("사람 vs 학습 AI", list(ai.VERSIONS)),
        ("대결", list(PLAYERS))]
sel = {"tab": 0, 0: "worm", 1: "v1", "blue": "worm", "orange": "v1"}


def pair():
    """(blue, orange) for the current menu choice; None = human."""
    t = sel["tab"]
    return (sel["blue"], sel["orange"]) if t == 2 else (None, sel[t])


def players(game):
    """(blue player, orange player). None = human. Blue is the left paddle / first seat.
    A missing (untrained) AI comes back as the string of its version."""
    def get(k):
        if k is None:
            return None
        if k in ai.VERSIONS:
            return ai.load(k) or k  # loaded fresh each game, so a newly trained AI shows up
        return load_or_train(k, game)
    return tuple(get(k) for k in pair())


def no_ai(ver):
    screen.fill(BG)
    text(f"아직 학습된 학습 AI {ver}가 없어요", F_MID, FG, (W // 2, H // 2 - 20), center=True)
    text(f"터미널에서 python train_ai.py {ver} 를 실행해 학습시킨 뒤 다시 하세요 (아무 키나 누르면 메뉴로)",
         F_SMALL, DIM, (W // 2, H // 2 + 24), center=True)
    pg.display.flip()
    while True:
        for ev in pg.event.get():
            if ev.type == pg.QUIT:
                raise SystemExit
            if ev.type in (pg.KEYDOWN, pg.MOUSEBUTTONDOWN):
                return
        clock.tick(30)


def name(p):
    return "사람" if p is None else p.wiring.label


def text(s, f, color, pos, center=False):
    img = f.render(s, True, color)
    r = img.get_rect(center=pos) if center else img.get_rect(topleft=pos)
    screen.blit(img, r)


def neuron_grid(brain, x0, top, compact):
    wr = brain.wiring
    v = brain.last_state[wr.order]
    if wr.N <= 400:
        cols, cell, gap = (30, 9, 1) if compact else (18, 17, 2)
    else:
        cols, cell, gap = 58, 5, 0
    for k, a in enumerate(v):
        r, c = divmod(k, cols)
        a = float(np.clip(a, -1, 1))
        col = (int(40 + 215 * a), int(40 + 110 * a), 40) if a > 0 else (40, int(40 - 90 * a), int(40 - 215 * a))
        pg.draw.rect(screen, col, (x0 + c * cell, top + r * cell, cell - gap, cell - gap))
    return top + ((wr.N - 1) // cols + 1) * cell


def draw_panel(brains, title, lines):
    brains = [b for b in brains if b is not None]
    pg.draw.rect(screen, (26, 29, 40), (GAME_W, 0, W - GAME_W, H))
    x0 = GAME_W + 20
    text(title, F_MID, FG, (x0, 20))
    for i, s in enumerate(lines):
        text(s, F_SMALL, DIM, (x0, 60 + i * 22))
    y = 60 + len(lines) * 22 + 16
    compact = len(brains) > 1
    for br in brains:
        wr = br.wiring
        text(f"{wr.label} 뉴런 {wr.N:,}개 활동", F_SMALL, FG, (x0, y))
        y = neuron_grid(br, x0, y + 24, compact) + 10
        for s in ([] if compact else wr.info):
            text(s, F_SMALL, DIM, (x0, y))
            y += 22
        y += 8
    if not compact:
        text("ESC: 메뉴로", F_SMALL, DIM, (x0, H - 34))


SPEEDS = [1, 2, 4, 8]
CY = H - 96  # controls row in the side panel


def control_rects():
    x0 = GAME_W + 20
    return {"minus": pg.Rect(x0, CY, 40, 36), "plus": pg.Rect(x0 + 130, CY, 40, 36),
            "stop": pg.Rect(x0 + 185, CY, 120, 36)}


def draw_controls(speed_i):
    r = control_rects()
    mouse = pg.mouse.get_pos()
    for key, label in (("minus", "−"), ("plus", "+"), ("stop", "그만 보기")):
        hot = r[key].collidepoint(mouse)
        col = (150, 50, 60) if key == "stop" else (45, 50, 68)
        pg.draw.rect(screen, tuple(min(c + 25, 255) for c in col) if hot else col, r[key], border_radius=8)
        text(label, F_MID if key != "stop" else F_SMALL, FG, r[key].center, center=True)
    text(f"배속 ×{SPEEDS[speed_i]}", F_SMALL, FG, (GAME_W + 85, CY + 18), center=True)
    text("+/- 키: 배속 · ESC: 그만 보기", F_SMALL, DIM, (GAME_W + 20, CY + 44))


def handle_controls(ev, speed_i):
    """Returns (new speed index, stop?)."""
    up = down = stop = False
    if ev.type == pg.MOUSEBUTTONDOWN and ev.button == 1:
        r = control_rects()
        up, down, stop = (r[k].collidepoint(ev.pos) for k in ("plus", "minus", "stop"))
    elif ev.type == pg.KEYDOWN:
        up = ev.key in (pg.K_EQUALS, pg.K_PLUS, pg.K_KP_PLUS, pg.K_f)
        down = ev.key in (pg.K_MINUS, pg.K_KP_MINUS)
    speed_i = min(speed_i + 1, len(SPEEDS) - 1) if up else max(speed_i - 1, 0) if down else speed_i
    return speed_i, stop


def loading(name):
    screen.fill(BG)
    text(f"{name}: {' vs '.join('사람' if k is None else PLAYERS[k][0] for k in pair())} 준비 중...", F_MID, FG, (W // 2, H // 2), center=True)
    text("(처음 한 번만 학습해요. 1~3분 걸려요)", F_SMALL, DIM, (W // 2, H // 2 + 40), center=True)
    pg.display.flip()
    pg.event.pump()


def quit_check(ev):
    if ev.type == pg.QUIT:
        raise SystemExit
    return ev.type == pg.KEYDOWN and ev.key == pg.K_ESCAPE


# ---------------------------------------------------------------- Paddle ball
def move_paddle(p, ball, side, me, opp):
    """New paddle position for a brain or my AI playing on `side` (+1 orange/top, -1 blue/bottom).
    My AI moves with the same inertia as the human; the insect brains move directly."""
    b = np.asarray(ball, float)
    if isinstance(p, ai.PaddleAI):
        return p.move(b, side, me, opp)
    return float(pd.move(me, decide(p, b, side, me))[0])


def decide(p, b, side, me):
    # the brains were trained as the orange paddle, so the blue one sees a mirrored court
    bx, by, vx, vy, _ = pd.view(b, side)
    return float(p(g.pong_features(bx, by, vx, vy, me))[0])


def play_paddle():
    loading("패들볼")
    left, right = players("pong")  # left (bottom) None = human on A/D
    missing = [p for p in (left, right) if isinstance(p, str)]
    if missing:
        no_ai(missing[0])
        return
    auto = left is not None
    PH, GOAL = pd.PH, 7
    # Physics lives in paddle.py. Spin: a paddle that is moving when it hits the ball
    # brushes it and makes it spin; the ball curves (Magnus effect) and the more it
    # spins, the faster it flies.
    # Human paddle has inertia: keys accelerate it, friction slows it down.
    HUMAN_ACC, FRICTION = pd.HUMAN_ACC, pd.FRICTION
    st = dict(score=[0, 0], hy=0.5, hv=0.0, by=0.5, serve_dir=1, ball=None, winner=None,
              angle=0.0, trail=[], wait=0)
    speed_i = 0

    def serve(d):
        return list(pd.serve(d, np.random.default_rng(), 1)[0])

    def step(keys):
        old_h, old_b = st["hy"], st["by"]
        ball = st["ball"]
        if left is None:
            push = (keys[pg.K_d] or keys[pg.K_RIGHT]) - (keys[pg.K_a] or keys[pg.K_LEFT])
            st["hv"] = (st["hv"] + HUMAN_ACC * push) * FRICTION
            st["hy"] += st["hv"]
            if not PH / 2 < st["hy"] < 1 - PH / 2:
                st["hv"] = 0.0  # stops dead at the wall
            st["hy"] = min(max(st["hy"], PH / 2), 1 - PH / 2)
        elif ball:
            st["hy"] = move_paddle(left, ball, -1, st["hy"], st["by"])
        if auto and ball is None:
            st["wait"] += 1
            if st["winner"] and st["wait"] > 180:
                st["score"], st["winner"], st["wait"] = [0, 0], None, 0
            elif not st["winner"] and st["wait"] > 50:
                st["ball"], st["trail"], st["wait"] = serve(st["serve_dir"]), [], 0
        if not ball:
            return
        st["by"] = move_paddle(right, ball, 1, st["by"], st["hy"])
        nb, scored, _ = pd.step(np.array([ball]), st["hy"], st["by"], st["hy"] - old_h, st["by"] - old_b)
        ball = [float(v) for v in nb[0]]
        st["angle"] += ball[4] * 30
        st["ball"] = ball
        st["trail"] = (st["trail"] + [(ball[0], ball[1])])[-14:]
        if scored[0]:
            p = 1 if scored[0] > 0 else 0  # +1: orange scored
            st["score"][p] += 1
            st["serve_dir"] = 1 if p == 0 else -1
            st["ball"], st["wait"] = None, 0
            if st["score"][p] >= GOAL:
                st["winner"] = f"{name(right if p == 1 else left)} 승리!"

    while True:
        for ev in pg.event.get():
            if quit_check(ev):
                return
            if auto:
                speed_i, stop = handle_controls(ev, speed_i)
                if stop:
                    return
            if ev.type == pg.KEYDOWN and ev.key == pg.K_SPACE:
                if st["winner"]:
                    st["score"], st["winner"] = [0, 0], None
                if st["ball"] is None:
                    st["ball"], st["trail"] = serve(st["serve_dir"]), []
        keys = pg.key.get_pressed()
        for _ in range(SPEEDS[speed_i] if auto else 1):
            step(keys)

        ball, hy, by_ = st["ball"], st["hy"], st["by"]
        # The physics runs along x (blue paddle at x=0, orange at x=1) with y sideways.
        # It is drawn rotated: blue at the bottom, orange at the top, paddles moving sideways.
        def to_screen(x, y):
            return y * GAME_W, (1 - x) * H

        screen.fill(BG)
        for x in range(0, GAME_W, 30):
            pg.draw.rect(screen, (50, 55, 70), (x, H // 2 - 2, 15, 4))
        ph = PH * GAME_W
        pg.draw.rect(screen, HUMAN_C, (hy * GAME_W - ph / 2, 0.97 * H, ph, 12))
        pg.draw.rect(screen, BRAIN_C, (by_ * GAME_W - ph / 2, 0.03 * H - 12, ph, 12))
        spin_amt = min(abs(ball[4]) / pd.SPIN_MAX, 1) if ball else 0
        level = float(pd.speed_factor(ball[4])) if ball else 1.0
        # positive spin bends the ball toward smaller y = leftwards on screen
        curve_dir = "" if not ball or spin_amt < 0.05 else ("←" if ball[4] > 0 else "→")
        if ball:
            # trail turns pink when the ball is spinning hard
            trail = st["trail"]
            tc = (int(120 + 135 * spin_amt), int(120 - 40 * spin_amt), int(140 + 40 * spin_amt))
            for k, (tx, ty) in enumerate(trail[:-1]):
                pg.draw.circle(screen, tc, to_screen(tx, ty), 1 + k * 5 // len(trail))
            cx, cy = to_screen(ball[0], ball[1])
            pg.draw.circle(screen, FG, (cx, cy), 9)
            dx, dy = 8 * np.cos(st["angle"]), 8 * np.sin(st["angle"])
            pg.draw.line(screen, (230, 70, 110), (cx - dx, cy - dy), (cx + dx, cy + dy), 3)
        text(str(st["score"][0]), F_BIG, HUMAN_C, (40, H // 2 + 40), center=True)
        text(str(st["score"][1]), F_BIG, BRAIN_C, (40, H // 2 - 40), center=True)
        if st["winner"]:
            text(st["winner"], F_BIG, FG, (GAME_W // 2, H // 2), center=True)
            text("곧 다음 경기" if auto else "SPACE: 다시 하기", F_SMALL, DIM, (GAME_W // 2, H // 2 + 40), center=True)
        elif ball is None and not auto:
            text("SPACE: 서브", F_MID, DIM, (GAME_W // 2, H // 2), center=True)
        lines = [f"{name(left)}(파랑) vs {name(right)}(주황)"]
        if not auto:
            lines += ["사람(아래): A/D 또는 ←/→ (관성 있음)","움직이면서 치면 회전이 걸려 휘어요",
                      "같은 방향으로 치면 더 세게, 반대면 약하게"]
        lines += [f"공 속도 ×{level:.1f} (회전이 셀수록 빨라짐)",
                  f"회전 {'■' * round(spin_amt * 10)}{'□' * (10 - round(spin_amt * 10))} {curve_dir}",
                  f"{GOAL}점 먼저 내면 승리"]
        draw_panel([left, right], "패들볼", lines)
        if auto:
            draw_controls(speed_i)
        pg.display.flip()
        clock.tick(FPS)


# ---------------------------------------------------------------- Menu
def button(r, label, on, f=F_MODE):
    pg.draw.rect(screen, (70, 50, 30) if on else (32, 36, 50), r, border_radius=12)
    pg.draw.rect(screen, BRAIN_C if on else (60, 65, 80), r, 2, border_radius=12)
    text(label, f, FG if on else DIM, r.center, center=True)


def choice_row(y, keys, chosen, label=None):
    """A row of player buttons centred at height y. Returns [(rect, key)]."""
    gap, room = 14, W - 60 - (140 if label else 0)  # leave space for the side label
    w = min(200, (room - gap * (len(keys) - 1)) // len(keys))
    x0 = W // 2 - (len(keys) * (w + gap) - gap) // 2 + (70 if label else 0)
    if label:
        text(label, F_SMALL, DIM, (x0 - 16 - F_SMALL.size(label)[0], y + 15))
    out = []
    for k, key in enumerate(keys):
        r = pg.Rect(x0 + k * (w + gap), y, w, 46)
        button(r, PLAYERS[key][0], key == chosen)
        out.append((r, key))
    return out


def menu():
    while True:
        screen.fill(BG)
        text("진짜 뇌와 대결", F_BIG, FG, (W // 2, 60), center=True)
        text("실제 커넥톰의 배선을 그대로 쓴 곤충 뇌, 그리고 스스로 연습한 학습 AI와 패들볼을 칩니다.",
             F_SMALL, DIM, (W // 2, 106), center=True)
        mouse = pg.mouse.get_pos()
        t = sel["tab"]
        tab_rects = []
        for k, (label, _) in enumerate(TABS):
            r = pg.Rect(W // 2 - 360 + k * 244, 140, 232, 52)
            tab_rects.append(r)
            button(r, label, k == t, F_MID)
        pg.draw.line(screen, (60, 65, 80), (W // 2 - 360, 204), (W // 2 + 360, 204), 1)
        if t == 2:
            picks = [(rk, "blue", key) for rk, key in choice_row(222, TABS[2][1], sel["blue"], "파랑(아래)")]
            picks += [(rk, "orange", key) for rk, key in choice_row(282, TABS[2][1], sel["orange"], "주황(위)")]
            desc = f"{PLAYERS[sel['blue']][0]}(파랑) vs {PLAYERS[sel['orange']][0]}(주황) · 대결을 구경합니다. 배속 조절, 그만 보기 버튼이 있어요"
        else:
            text("상대 고르기", F_SMALL, DIM, (W // 2, 230), center=True)
            picks = [(rk, t, key) for rk, key in choice_row(252, TABS[t][1], sel[t])]
            desc = PLAYERS[sel[t]][1]
        text(desc, F_SMALL, DIM, (W // 2, 352), center=True)
        go = pg.Rect(W // 2 - 180, 390, 360, 66)
        pg.draw.rect(screen, (45, 50, 68) if go.collidepoint(mouse) else (32, 36, 50), go, border_radius=12)
        pg.draw.rect(screen, HUMAN_C, go, 2, border_radius=12)
        text("패들볼 시작", F_MID, FG, go.center, center=True)
        text("TAB: 탭 바꾸기 · 1 / Enter 또는 클릭: 시작 · ESC: 종료", F_SMALL, DIM, (W // 2, H - 52), center=True)
        text("초파리 데이터: FlyWire (CC BY-NC 4.0) · 꼬마선충 데이터: Cook et al. 2019 · 비상업적 사용 · 자세한 출처는 README",
             F_TINY, DIM, (W // 2, H - 22), center=True)
        pg.display.flip()
        for ev in pg.event.get():
            if quit_check(ev):
                raise SystemExit
            if ev.type == pg.KEYDOWN and ev.key == pg.K_TAB:
                sel["tab"] = (t + 1) % len(TABS)
            if ev.type == pg.KEYDOWN and ev.key in (pg.K_1, pg.K_RETURN, pg.K_KP_ENTER):
                play_paddle()
            if ev.type == pg.MOUSEBUTTONDOWN:
                for k, r in enumerate(tab_rects):
                    if r.collidepoint(ev.pos):
                        sel["tab"] = k
                for r, slot, key in picks:
                    if r.collidepoint(ev.pos):
                        sel[slot] = key
                if go.collidepoint(ev.pos):
                    play_paddle()
        clock.tick(FPS)


if __name__ == "__main__":
    menu()
