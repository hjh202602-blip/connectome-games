"""Play Pong, Tic-tac-toe and Connect Four against a real connectome brain (worm or fly)."""
import numpy as np
import pygame as pg
import games as g
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


F_BIG, F_MID, F_SMALL = font(40, True), font(24, True), font(17)
BRAINS = [("worm", "꼬마선충"), ("fly", "초파리")]
MODES = [("사람 vs 꼬마선충", "C. elegans 뉴런 302개 전부 (Cook 2019)"),
         ("사람 vs 초파리", "FlyWire 초파리 뇌에서 잘라낸 뉴런 2,000개 회로 (2024)"),
         ("꼬마선충 vs 초파리", "두 뇌끼리 대결합니다. 배속 조절, 그만 보기 버튼이 있어요")]
current = [0]  # index into MODES


def players(game):
    """(blue player, orange player). None = human. Blue is the left paddle / first seat."""
    if current[0] == 2:
        return load_or_train("worm", game), load_or_train("fly", game)
    return None, load_or_train(BRAINS[current[0]][0], game)


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
    text(f"{name}: {MODES[current[0]][0]} 준비 중...", F_MID, FG, (W // 2, H // 2), center=True)
    text("(처음 한 번만 학습해요. 퐁·사목은 1~3분 걸려요)", F_SMALL, DIM, (W // 2, H // 2 + 40), center=True)
    pg.display.flip()
    pg.event.pump()


def quit_check(ev):
    if ev.type == pg.QUIT:
        raise SystemExit
    return ev.type == pg.KEYDOWN and ev.key == pg.K_ESCAPE


# ---------------------------------------------------------------- Pong
def play_pong():
    loading("퐁")
    left, right = players("pong")  # left (bottom) None = human on A/D
    auto = left is not None
    PH, HUMAN_SPD, BRAIN_SPD, GOAL = 0.18, 0.02, 0.018, 7
    # Spin: a paddle that is moving when it hits the ball brushes it and makes it spin.
    # The ball is first pushed the way the paddle moved, then curves back the other way
    # (Magnus effect, like a sidespin shot in table tennis).
    # Spin is stored as "paddle speed it came from", so hitting while moving the same way
    # as the spin adds to it, and moving the other way cancels it or flips it.
    PUSH, CURVE, SPIN_DECAY, VY_MAX = 0.4, 0.012, 0.993, 0.03
    SPIN_GAIN, SPIN_MAX = 1.2, 0.05
    st = dict(score=[0, 0], hy=0.5, by=0.5, serve_dir=1, ball=None, winner=None,
              angle=0.0, trail=[], wait=0)
    speed_i = 0

    def serve(d):
        a = np.random.uniform(-0.6, 0.6)
        return [0.5, 0.5, d * 0.01 * np.cos(a), 0.01 * np.sin(a), 0.0]

    def step(keys):
        old_h, old_b = st["hy"], st["by"]
        ball = st["ball"]
        if left is None:
            st["hy"] += HUMAN_SPD * ((keys[pg.K_d] or keys[pg.K_RIGHT]) - (keys[pg.K_a] or keys[pg.K_LEFT]))
        elif ball:
            # the brains were trained as the right paddle, so the left one sees a mirrored court
            bx, byy, vx, vy, _ = ball
            out = left(g.pong_features(1 - bx, byy, -vx, vy, st["hy"]))[0]
            st["hy"] += BRAIN_SPD * float(np.clip(out, -1, 1))
        st["hy"] = min(max(st["hy"], PH / 2), 1 - PH / 2)
        if auto and ball is None:
            st["wait"] += 1
            if st["winner"] and st["wait"] > 180:
                st["score"], st["winner"], st["wait"] = [0, 0], None, 0
            elif not st["winner"] and st["wait"] > 50:
                st["ball"], st["trail"], st["wait"] = serve(st["serve_dir"]), [], 0
        if not ball:
            return
        bx, byy, vx, vy, spin = ball
        out = right(g.pong_features(bx, byy, vx, vy, st["by"]))[0]
        st["by"] = min(max(st["by"] + BRAIN_SPD * float(np.clip(out, -1, 1)), PH / 2), 1 - PH / 2)
        vel = {-1: st["hy"] - old_h, 1: st["by"] - old_b}  # paddle speed this frame
        vy = float(np.clip(vy - spin * CURVE, -VY_MAX, VY_MAX))  # curve
        spin *= SPIN_DECAY
        st["angle"] += spin * 30
        bx, byy = bx + vx, byy + vy
        if byy < 0 or byy > 1:
            vy, byy = -vy, min(max(byy, 0), 1)
            spin *= 0.7  # the wall rubs some spin off
        for px, py, side in ((0.03, st["hy"], -1), (0.97, st["by"], 1)):
            if (bx - px) * side >= 0 and vx * side > 0 and abs(byy - py) < PH / 2 + 0.01:
                speed = min(abs(vx) * 1.06, 0.02)
                vx = -side * speed
                pv = vel[side]
                vy = float(np.clip(vy + (byy - py) * 0.06 + pv * PUSH, -VY_MAX, VY_MAX))
                # same direction as the spin -> faster spin; opposite -> weaker or reversed
                spin = float(np.clip(spin + pv * SPIN_GAIN, -SPIN_MAX, SPIN_MAX))
                bx = px
        st["ball"] = [bx, byy, vx, vy, spin]
        st["trail"] = (st["trail"] + [(bx, byy)])[-14:]
        if bx < -0.02 or bx > 1.02:
            p = 1 if bx < 0 else 0
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
        spin_amt = min(abs(ball[4]) / SPIN_MAX, 1) if ball else 0
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
            lines += ["사람(아래): A/D 또는 ←/→", "움직이면서 치면 회전이 걸려 휘어요",
                      "같은 방향으로 치면 더 세게, 반대면 약하게"]
        lines += [f"회전 {'■' * round(spin_amt * 10)}{'□' * (10 - round(spin_amt * 10))} {curve_dir}",
                  f"{GOAL}점 먼저 내면 승리"]
        draw_panel([left, right], "퐁", lines)
        if auto:
            draw_controls(speed_i)
        pg.display.flip()
        clock.tick(FPS)


# ---------------------------------------------------------------- Board games
def play_ttt():
    loading("틱택토")
    seats = players("ttt")
    S, X0, Y0 = 160, (GAME_W - 480) // 2, 50
    state_human = [1]

    def play(b, i, p):
        nb = b[:i] + (p,) + b[i + 1:]
        w = g.ttt_winner(nb)
        return nb, (w if w else None)

    def mouse(pos):
        c, r = (pos[0] - X0) // S, (pos[1] - Y0) // S
        return r * 3 + c if 0 <= c < 3 and 0 <= r < 3 else None

    def draw(b):
        for k in range(1, 3):
            pg.draw.line(screen, DIM, (X0 + k * S, Y0), (X0 + k * S, Y0 + 3 * S), 4)
            pg.draw.line(screen, DIM, (X0, Y0 + k * S), (X0 + 3 * S, Y0 + k * S), 4)
        for i, p in enumerate(b):
            cx, cy = X0 + (i % 3) * S + S // 2, Y0 + (i // 3) * S + S // 2
            if p == 1:
                d = 45
                pg.draw.line(screen, HUMAN_C if state_human[0] == 1 else BRAIN_C, (cx - d, cy - d), (cx + d, cy + d), 10)
                pg.draw.line(screen, HUMAN_C if state_human[0] == 1 else BRAIN_C, (cx - d, cy + d), (cx + d, cy - d), 10)
            elif p == -1:
                pg.draw.circle(screen, HUMAN_C if state_human[0] == -1 else BRAIN_C, (cx, cy), 50, 10)

    _run(seats, "틱택토", lambda: (0,) * 9, lambda b: [i for i in range(9) if b[i] == 0],
         play, lambda b, t: g.ttt_features(b), mouse, draw, state_human)


def play_c4():
    loading("사목")
    seats = players("c4")
    S = 78
    X0, Y0 = (GAME_W - S * g.COLS) // 2, 40
    state_human = [1]

    def play(b, c, p):
        nb, r = g.c4_drop(b, c, p)
        if g.c4_wins(nb, r, c):
            return nb, p
        return nb, (2 if not g.c4_legal(nb) else None)

    def mouse(pos):
        c = (pos[0] - X0) // S
        return int(c) if 0 <= c < g.COLS else None

    def draw(b):
        pg.draw.rect(screen, (35, 55, 110), (X0 - 8, Y0 - 8, S * g.COLS + 16, S * g.ROWS + 16), border_radius=12)
        for r in range(g.ROWS):
            for c in range(g.COLS):
                p = b[r, c]
                col = BG if p == 0 else (HUMAN_C if p == state_human[0] else BRAIN_C)
                pg.draw.circle(screen, col, (X0 + c * S + S // 2, Y0 + r * S + S // 2), S // 2 - 6)
        mx = pg.mouse.get_pos()[0]
        c = (mx - X0) // S
        if 0 <= c < g.COLS and mx < GAME_W:
            pg.draw.polygon(screen, DIM, [(X0 + c * S + S // 2 - 12, Y0 + S * g.ROWS + 16),
                                          (X0 + c * S + S // 2 + 12, Y0 + S * g.ROWS + 16),
                                          (X0 + c * S + S // 2, Y0 + S * g.ROWS + 4)])

    _run(seats, "사목", g.c4_new, g.c4_legal, play, lambda b, t: g.c4_features(b, t), mouse, draw, state_human)


def _run(seats, title, new, legal, play, features, mouse, draw, blue_side):
    """Turn loop shared by the board games. seats = (blue, orange); None = human.
    The two seats swap who moves first every game. blue_side[0] is the blue player's
    side (1 = moves first) so the draw functions can colour the pieces."""
    auto = all(p is not None for p in seats)
    blue_first = True
    stats = [0, 0, 0]  # blue wins, orange wins, draws
    speed_i = 0

    def start():
        blue_side[0] = 1 if blue_first else -1
        return new(), 1, None, pg.time.get_ticks(), False

    state, turn, result, t_turn, counted = start()
    while True:
        blue = blue_side[0]
        mover = seats[0] if turn == blue else seats[1]
        delay = 450 / SPEEDS[speed_i]
        for ev in pg.event.get():
            if quit_check(ev):
                return
            if auto:
                speed_i, stop = handle_controls(ev, speed_i)
                if stop:
                    return
            elif result is not None and ev.type == pg.MOUSEBUTTONDOWN:
                blue_first = not blue_first
                state, turn, result, t_turn, counted = start()
            elif result is None and mover is None and ev.type == pg.MOUSEBUTTONDOWN and ev.button == 1:
                m = mouse(ev.pos)
                if m is not None and m in legal(state):
                    state, result = play(state, m, turn)
                    turn, t_turn = -turn, pg.time.get_ticks()

        if result is None and mover is not None and pg.time.get_ticks() - t_turn > delay:
            scores = mover(features(state, turn))
            if auto:  # brains are deterministic; a little noise keeps brain-vs-brain games varied
                scores = scores + np.random.normal(0, 0.15, len(scores))
            m = max(legal(state), key=lambda k: scores[k])
            state, result = play(state, m, turn)
            turn, t_turn = -turn, pg.time.get_ticks()
        if result is not None and not counted:
            stats[2 if result == 2 else 0 if result == blue else 1] += 1
            counted, t_turn = True, pg.time.get_ticks()
        if auto and result is not None and pg.time.get_ticks() - t_turn > 2000 / SPEEDS[speed_i]:
            blue_first = not blue_first
            state, turn, result, t_turn, counted = start()

        screen.fill(BG)
        draw(state)
        if result is not None:
            msg = "무승부" if result == 2 else f"{name(seats[0] if result == blue else seats[1])} 승리!"
            text(msg, F_BIG, FG, (GAME_W // 2, H - 70), center=True)
            text("곧 다음 판 (선공 교대)" if auto else "클릭하면 다음 판 (선공 교대)",
                 F_SMALL, DIM, (GAME_W // 2, H - 30), center=True)
        else:
            mine = turn == blue
            msg = "당신 차례 (클릭)" if mover is None else f"{name(mover)} 생각 중..."
            text(msg, F_MID, HUMAN_C if mine else BRAIN_C, (GAME_W // 2, H - 50), center=True)
        lines = [f"{name(seats[0])}(파랑) vs {name(seats[1])}(주황)",
                 f"이번 판 선공: {name(seats[0] if blue == 1 else seats[1])}",
                 f"전적  {stats[0]} : {stats[1]}   무승부 {stats[2]}"]
        draw_panel(seats, title, lines)
        if auto:
            draw_controls(speed_i)
        pg.display.flip()
        clock.tick(FPS)


# ---------------------------------------------------------------- Menu
def menu():
    items = [("1", "퐁", play_pong), ("2", "틱택토", play_ttt), ("3", "사목 (Connect Four)", play_c4)]
    while True:
        rects, brain_rects = [], []
        screen.fill(BG)
        text("진짜 뇌와 대결", F_BIG, FG, (W // 2, 70), center=True)
        text("실제 커넥톰의 배선을 그대로 쓰고, 수를 읽어내는 출력층만 학습시킨 AI입니다.",
             F_SMALL, DIM, (W // 2, 120), center=True)
        mouse = pg.mouse.get_pos()
        for k, (label, desc) in enumerate(MODES):
            r = pg.Rect(W // 2 - 465 + k * 315, 160, 300, 60)
            brain_rects.append(r)
            on = k == current[0]
            pg.draw.rect(screen, (70, 50, 30) if on else (32, 36, 50), r, border_radius=12)
            pg.draw.rect(screen, BRAIN_C if on else (60, 65, 80), r, 2, border_radius=12)
            text(label, F_MID, FG if on else DIM, r.center, center=True)
        text(MODES[current[0]][1], F_SMALL, DIM, (W // 2, 240), center=True)
        for k, (key, label, fn) in enumerate(items):
            r = pg.Rect(W // 2 - 180, 290 + k * 90, 360, 66)
            rects.append((r, fn))
            pg.draw.rect(screen, (45, 50, 68) if r.collidepoint(mouse) else (32, 36, 50), r, border_radius=12)
            text(f"{key}.  {label}", F_MID, FG, r.center, center=True)
        text("TAB: 모드 바꾸기 · 숫자키 또는 클릭: 게임 선택 · ESC: 종료", F_SMALL, DIM, (W // 2, H - 30), center=True)
        pg.display.flip()
        for ev in pg.event.get():
            if quit_check(ev):
                raise SystemExit
            if ev.type == pg.KEYDOWN and ev.key == pg.K_TAB:
                current[0] = (current[0] + 1) % len(MODES)
            if ev.type == pg.KEYDOWN and pg.K_1 <= ev.key <= pg.K_3:
                items[ev.key - pg.K_1][2]()
            if ev.type == pg.MOUSEBUTTONDOWN:
                for k, r in enumerate(brain_rects):
                    if r.collidepoint(ev.pos):
                        current[0] = k
                for r, fn in rects:
                    if r.collidepoint(ev.pos):
                        fn()
        clock.tick(FPS)


if __name__ == "__main__":
    menu()
