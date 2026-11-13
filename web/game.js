// Browser version of main.py: Pong, Tic-tac-toe and Connect Four against real connectome brains.
(function () {
  "use strict";
  const W = 980, H = 640, GAME_W = 640, FPS = 60;
  const BG = "#12141c", FG = "#e6e8f0", DIM = "#787d8c", PANEL = "#1a1d28";
  const HUMAN_C = "#5aaaff", BRAIN_C = "#ff9646";
  const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const F_BIG = `bold 40px ${FONT}`, F_MID = `bold 24px ${FONT}`, F_SMALL = `17px ${FONT}`;

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");
  const BR = ConnectomeBrain.loadBrains(window.BRAIN_DATA);
  document.getElementById("loading").remove();

  // ------------------------------------------------------------ layout / input
  function fit() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = W * s + "px";
    canvas.style.height = H * s + "px";
  }
  window.addEventListener("resize", fit);
  fit();

  const mouse = { x: -1, y: -1 };
  const held = new Set();
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener("mousemove", e => Object.assign(mouse, toCanvas(e)));
  canvas.addEventListener("pointerdown", e => { const p = toCanvas(e); Object.assign(mouse, p); scene.click && scene.click(p.x, p.y); });
  window.addEventListener("keydown", e => {
    if (document.getElementById("credits").open) return; // let the credits dialog handle keys
    if (["Tab", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    held.add(e.key.toLowerCase());
    scene.key && scene.key(e.key);
  });
  window.addEventListener("keyup", e => held.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());

  // ------------------------------------------------------------ drawing helpers
  function text(s, font, color, x, y, center = false) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = center ? "center" : "left";
    ctx.textBaseline = center ? "middle" : "top";
    ctx.fillText(s, x, y);
  }
  function rrect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  }
  const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  function button(r, label, font, fill, hotFill) {
    rrect(r.x, r.y, r.w, r.h, 8, inRect(r, mouse.x, mouse.y) ? hotFill : fill);
    text(label, font, FG, r.x + r.w / 2, r.y + r.h / 2, true);
  }
  function activityColor(a) {
    a = Math.max(-1, Math.min(1, a));
    return a > 0 ? `rgb(${40 + 215 * a | 0},${40 + 110 * a | 0},40)` : `rgb(40,${40 - 90 * a | 0},${40 - 215 * a | 0})`;
  }
  function neuronGrid(brain, x0, top, compact) {
    const wr = brain.wiring, v = brain.lastState;
    let cols, cell, gap;
    if (wr.N <= 400) [cols, cell, gap] = compact ? [30, 9, 1] : [18, 17, 2];
    else [cols, cell, gap] = [58, 5, 0];
    for (let k = 0; k < wr.N; k++) {
      const r = Math.floor(k / cols), c = k % cols;
      ctx.fillStyle = activityColor(v[wr.order[k]]);
      ctx.fillRect(x0 + c * cell, top + r * cell, cell - gap, cell - gap);
    }
    return top + Math.ceil(wr.N / cols) * cell;
  }
  const MENU_BTN = { x: GAME_W + 20, y: H - 50, w: 110, h: 34 };
  function drawPanel(brains, title, lines) {
    brains = brains.filter(b => b);
    ctx.fillStyle = PANEL;
    ctx.fillRect(GAME_W, 0, W - GAME_W, H);
    const x0 = GAME_W + 20;
    text(title, F_MID, FG, x0, 20);
    lines.forEach((s, i) => text(s, F_SMALL, DIM, x0, 60 + i * 22));
    let y = 60 + lines.length * 22 + 16;
    const compact = brains.length > 1;
    for (const b of brains) {
      const wr = b.wiring;
      text(`${wr.label} 뉴런 ${wr.N.toLocaleString()}개 활동`, F_SMALL, FG, x0, y);
      y = neuronGrid(b, x0, y + 24, compact) + 10;
      if (!compact) for (const s of wr.info) { text(s, F_SMALL, DIM, x0, y); y += 22; }
      y += 8;
    }
    if (!compact) button(MENU_BTN, "◀ 메뉴 (Q)", F_SMALL, "#2d3244", "#3c4258");
  }

  // brain-vs-brain controls
  const SPEEDS = [1, 2, 4, 8], CY = H - 96;
  const CTRL = {
    minus: { x: GAME_W + 20, y: CY, w: 40, h: 36 },
    plus: { x: GAME_W + 150, y: CY, w: 40, h: 36 },
    stop: { x: GAME_W + 205, y: CY, w: 120, h: 36 },
  };
  function drawControls(si) {
    button(CTRL.minus, "−", F_MID, "#2d3244", "#3c4258");
    button(CTRL.plus, "+", F_MID, "#2d3244", "#3c4258");
    button(CTRL.stop, "그만 보기", F_SMALL, "#96323c", "#af4b55");
    text(`배속 ×${SPEEDS[si]}`, F_SMALL, FG, GAME_W + 105, CY + 18, true);
    text("+/- 키: 배속 · Q: 그만 보기", F_SMALL, DIM, GAME_W + 20, CY + 46);
  }
  function controlClick(si, x, y) {
    if (inRect(CTRL.stop, x, y)) return [si, true];
    if (inRect(CTRL.plus, x, y)) return [Math.min(si + 1, SPEEDS.length - 1), false];
    if (inRect(CTRL.minus, x, y)) return [Math.max(si - 1, 0), false];
    return [si, false];
  }
  function controlKey(si, k) {
    if (["+", "=", "f", "F"].includes(k)) return Math.min(si + 1, SPEEDS.length - 1);
    if (["-", "_"].includes(k)) return Math.max(si - 1, 0);
    return si;
  }
  const isQuit = k => k === "Escape" || k === "q" || k === "Q";

  // ------------------------------------------------------------ modes
  const MODES = [
    ["사람 vs 꼬마선충", "C. elegans 뉴런 302개 전부 (Cook 2019)"],
    ["사람 vs 초파리", "FlyWire 초파리 뇌에서 잘라낸 뉴런 2,000개 회로 (2024)"],
    ["꼬마선충 vs 초파리", "두 뇌끼리 대결합니다. 배속 조절, 그만 보기 버튼이 있어요"],
  ];
  let mode = 0;
  function players(game) {
    if (mode === 2) return [BR.worm[game], BR.fly[game]];
    return [null, BR[mode === 0 ? "worm" : "fly"][game]];
  }
  const nameOf = p => (p ? p.wiring.label : "사람");
  function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()); }
  const clip = (x, a, b) => Math.max(a, Math.min(b, x));

  let scene;
  function go(s) { scene = s; }

  // ------------------------------------------------------------ menu
  function Menu() {
    const modeR = MODES.map((_, k) => ({ x: W / 2 - 465 + k * 315, y: 160, w: 300, h: 60 }));
    const games = [["1", "퐁", Pong], ["2", "틱택토", TicTacToe], ["3", "사목 (Connect Four)", ConnectFour]];
    const gameR = games.map((_, k) => ({ x: W / 2 - 180, y: 290 + k * 90, w: 360, h: 66 }));
    const fsR = { x: W - 150, y: 16, w: 134, h: 36 };
    const creditsR = { x: 16, y: 16, w: 150, h: 36 };
    return {
      draw() {
        ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
        text("진짜 뇌와 대결", F_BIG, FG, W / 2, 70, true);
        text("실제 커넥톰의 배선을 그대로 쓰고, 수를 읽어내는 출력층만 학습시킨 AI입니다.", F_SMALL, DIM, W / 2, 120, true);
        MODES.forEach(([label], k) => {
          const on = k === mode, r = modeR[k];
          rrect(r.x, r.y, r.w, r.h, 12, on ? "#46321e" : "#202432", on ? BRAIN_C : "#3c4150");
          text(label, F_MID, on ? FG : DIM, r.x + r.w / 2, r.y + r.h / 2, true);
        });
        text(MODES[mode][1], F_SMALL, DIM, W / 2, 240, true);
        games.forEach(([key, label], k) => {
          const r = gameR[k];
          rrect(r.x, r.y, r.w, r.h, 12, inRect(r, mouse.x, mouse.y) ? "#2d3244" : "#202432");
          text(`${key}.  ${label}`, F_MID, FG, r.x + r.w / 2, r.y + r.h / 2, true);
        });
        button(fsR, document.fullscreenElement ? "창 모드" : "전체화면", F_SMALL, "#2d3244", "#3c4258");
        button(creditsR, "출처·라이선스", F_SMALL, "#2d3244", "#3c4258");
        text("TAB: 모드 바꾸기 · 숫자키 또는 클릭: 게임 선택", F_SMALL, DIM, W / 2, H - 52, true);
        text("초파리 데이터: FlyWire (CC BY-NC 4.0) · 꼬마선충 데이터: Cook et al. 2019 · 비상업적 사용",
             `13px ${FONT}`, DIM, W / 2, H - 22, true);
      },
      click(x, y) {
        modeR.forEach((r, k) => { if (inRect(r, x, y)) mode = k; });
        gameR.forEach((r, k) => { if (inRect(r, x, y)) go(games[k][2]()); });
        if (inRect(creditsR, x, y)) {
          document.getElementById("credits").showModal();
        }
        if (inRect(fsR, x, y)) {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen().catch(() => {});
        }
      },
      key(k) {
        if (k === "Tab") mode = (mode + 1) % MODES.length;
        if (k >= "1" && k <= "3") go(games[+k - 1][2]());
      },
    };
  }

  // ------------------------------------------------------------ pong
  const pongFeatures = (bx, by, vx, vy, py) => [bx * 2 - 1, by * 2 - 1, vx * 40, vy * 40, py * 2 - 1, (by - py) * 2];

  function Pong() {
    const [left, right] = players("pong"); // left (bottom) null = human
    const auto = !!left;
    const PH = 0.18, HUMAN_SPD = 0.02, BRAIN_SPD = 0.018, GOAL = 7;
    // Spin is stored as "paddle speed it came from": hitting while moving the same way adds,
    // moving the other way cancels or flips it. The ball curves against its spin (Magnus).
    const PUSH = 0.4, CURVE = 0.012, SPIN_DECAY = 0.993, VY_MAX = 0.03, SPIN_GAIN = 1.2, SPIN_MAX = 0.05;
    const st = { score: [0, 0], hy: 0.5, by: 0.5, serveDir: 1, ball: null, winner: null, angle: 0, trail: [], wait: 0 };
    let si = 0;

    function serve(d) {
      const a = (Math.random() * 2 - 1) * 0.6;
      return [0.5, 0.5, d * 0.01 * Math.cos(a), 0.01 * Math.sin(a), 0];
    }
    function step() {
      const oldH = st.hy, oldB = st.by, ball = st.ball;
      if (!left) {
        st.hy += HUMAN_SPD * ((held.has("d") || held.has("arrowright")) - (held.has("a") || held.has("arrowleft")));
      } else if (ball) {
        const [bx, by, vx, vy] = ball; // left brain sees a mirrored court
        st.hy += BRAIN_SPD * clip(left.predict(pongFeatures(1 - bx, by, -vx, vy, st.hy))[0], -1, 1);
      }
      st.hy = clip(st.hy, PH / 2, 1 - PH / 2);
      if (auto && !ball) {
        st.wait++;
        if (st.winner && st.wait > 180) { st.score = [0, 0]; st.winner = null; st.wait = 0; }
        else if (!st.winner && st.wait > 50) { st.ball = serve(st.serveDir); st.trail = []; st.wait = 0; }
      }
      if (!ball) return;
      let [bx, by, vx, vy, spin] = ball;
      st.by = clip(st.by + BRAIN_SPD * clip(right.predict(pongFeatures(bx, by, vx, vy, st.by))[0], -1, 1), PH / 2, 1 - PH / 2);
      const vel = { "-1": st.hy - oldH, "1": st.by - oldB };
      vy = clip(vy - spin * CURVE, -VY_MAX, VY_MAX);
      spin *= SPIN_DECAY;
      st.angle += spin * 30;
      bx += vx; by += vy;
      if (by < 0 || by > 1) { vy = -vy; by = clip(by, 0, 1); spin *= 0.7; }
      for (const [px, py, side] of [[0.03, st.hy, -1], [0.97, st.by, 1]]) {
        if ((bx - px) * side >= 0 && vx * side > 0 && Math.abs(by - py) < PH / 2 + 0.01) {
          vx = -side * Math.min(Math.abs(vx) * 1.06, 0.02);
          const pv = vel[side];
          vy = clip(vy + (by - py) * 0.06 + pv * PUSH, -VY_MAX, VY_MAX);
          spin = clip(spin + pv * SPIN_GAIN, -SPIN_MAX, SPIN_MAX);
          bx = px;
        }
      }
      st.ball = [bx, by, vx, vy, spin];
      st.trail.push([bx, by]);
      if (st.trail.length > 14) st.trail.shift();
      if (bx < -0.02 || bx > 1.02) {
        const p = bx < 0 ? 1 : 0;
        st.score[p]++;
        st.serveDir = p === 0 ? 1 : -1;
        st.ball = null; st.wait = 0;
        if (st.score[p] >= GOAL) st.winner = `${nameOf(p === 1 ? right : left)} 승리!`;
      }
    }
    const toScreen = (x, y) => [y * GAME_W, (1 - x) * H]; // drawn rotated: blue bottom, orange top

    return {
      update() { for (let i = 0; i < (auto ? SPEEDS[si] : 1); i++) step(); },
      draw() {
        const { ball, hy, by } = st;
        ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#323746";
        for (let x = 0; x < GAME_W; x += 30) ctx.fillRect(x, H / 2 - 2, 15, 4);
        const ph = PH * GAME_W;
        ctx.fillStyle = HUMAN_C; ctx.fillRect(hy * GAME_W - ph / 2, 0.97 * H, ph, 12);
        ctx.fillStyle = BRAIN_C; ctx.fillRect(by * GAME_W - ph / 2, 0.03 * H - 12, ph, 12);
        const amt = ball ? Math.min(Math.abs(ball[4]) / SPIN_MAX, 1) : 0;
        const dir = !ball || amt < 0.05 ? "" : ball[4] > 0 ? "←" : "→";
        if (ball) {
          ctx.fillStyle = `rgb(${120 + 135 * amt | 0},${120 - 40 * amt | 0},${140 + 40 * amt | 0})`;
          st.trail.slice(0, -1).forEach(([tx, ty], k) => {
            const [sx, sy] = toScreen(tx, ty);
            ctx.beginPath(); ctx.arc(sx, sy, 1 + Math.floor(k * 5 / st.trail.length), 0, 7); ctx.fill();
          });
          const [cx, cy] = toScreen(ball[0], ball[1]);
          ctx.fillStyle = FG; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.fill();
          const dx = 8 * Math.cos(st.angle), dy = 8 * Math.sin(st.angle);
          ctx.strokeStyle = "#e6466e"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(cx - dx, cy - dy); ctx.lineTo(cx + dx, cy + dy); ctx.stroke();
        }
        text(String(st.score[0]), F_BIG, HUMAN_C, 40, H / 2 + 40, true);
        text(String(st.score[1]), F_BIG, BRAIN_C, 40, H / 2 - 40, true);
        if (st.winner) {
          text(st.winner, F_BIG, FG, GAME_W / 2, H / 2, true);
          text(auto ? "곧 다음 경기" : "SPACE: 다시 하기", F_SMALL, DIM, GAME_W / 2, H / 2 + 40, true);
        } else if (!ball && !auto) text("SPACE: 서브", F_MID, DIM, GAME_W / 2, H / 2, true);
        let lines = [`${nameOf(left)}(파랑) vs ${nameOf(right)}(주황)`];
        if (!auto) lines.push("사람(아래): A/D 또는 ←/→", "움직이면서 치면 회전이 걸려 휘어요", "같은 방향으로 치면 더 세게, 반대면 약하게");
        const n = Math.round(amt * 10);
        lines.push(`회전 ${"■".repeat(n)}${"□".repeat(10 - n)} ${dir}`, `${GOAL}점 먼저 내면 승리`);
        drawPanel([left, right], "퐁", lines);
        if (auto) drawControls(si);
      },
      key(k) {
        if (isQuit(k)) return go(Menu());
        if (auto) si = controlKey(si, k);
        if (k === " ") {
          if (st.winner) { st.score = [0, 0]; st.winner = null; }
          if (!st.ball) { st.ball = serve(st.serveDir); st.trail = []; }
        }
      },
      click(x, y) {
        if (auto) { let stop; [si, stop] = controlClick(si, x, y); if (stop) go(Menu()); }
        else if (inRect(MENU_BTN, x, y)) go(Menu());
      },
    };
  }

  // ------------------------------------------------------------ board games
  // Turn loop shared by the board games. seats = [blue, orange]; null = human.
  // The two seats swap who moves first each game. blueSide = 1 when blue moves first.
  function BoardGame(game, title, rules) {
    const seats = players(game);
    const auto = seats.every(p => p);
    let blueFirst = true, stats = [0, 0, 0], si = 0;
    let s, turn, result, tTurn, counted, blueSide;
    function start() {
      blueSide = blueFirst ? 1 : -1;
      s = rules.create(); turn = 1; result = null; tTurn = performance.now(); counted = false;
    }
    start();
    const mover = () => (turn === blueSide ? seats[0] : seats[1]);
    function move(m) {
      [s, result] = rules.play(s, m, turn);
      turn = -turn; tTurn = performance.now();
    }
    return {
      update() {
        const now = performance.now(), sp = auto ? SPEEDS[si] : 1, p = mover();
        if (result === null && p && now - tTurn > 450 / sp) {
          let scores = p.predict(rules.features(s, turn));
          if (auto) scores = scores.map(v => v + 0.15 * gauss()); // keep brain-vs-brain games varied
          const legal = rules.legal(s);
          move(legal.reduce((a, b) => (scores[b] > scores[a] ? b : a)));
        }
        if (result !== null && !counted) {
          stats[result === 2 ? 2 : result === blueSide ? 0 : 1]++;
          counted = true; tTurn = now;
        }
        if (auto && result !== null && now - tTurn > 2000 / sp) { blueFirst = !blueFirst; start(); }
      },
      draw() {
        ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
        rules.draw(s, blueSide);
        if (result !== null) {
          const msg = result === 2 ? "무승부" : `${nameOf(result === blueSide ? seats[0] : seats[1])} 승리!`;
          text(msg, F_BIG, FG, GAME_W / 2, H - 70, true);
          text(auto ? "곧 다음 판 (선공 교대)" : "클릭하면 다음 판 (선공 교대)", F_SMALL, DIM, GAME_W / 2, H - 30, true);
        } else {
          const p = mover();
          text(p ? `${nameOf(p)} 생각 중...` : "당신 차례 (클릭)", F_MID, turn === blueSide ? HUMAN_C : BRAIN_C, GAME_W / 2, H - 50, true);
        }
        drawPanel(seats, title, [
          `${nameOf(seats[0])}(파랑) vs ${nameOf(seats[1])}(주황)`,
          `이번 판 선공: ${nameOf(blueSide === 1 ? seats[0] : seats[1])}`,
          `전적  ${stats[0]} : ${stats[1]}   무승부 ${stats[2]}`,
        ]);
        if (auto) drawControls(si);
      },
      key(k) {
        if (isQuit(k)) return go(Menu());
        if (auto) si = controlKey(si, k);
      },
      click(x, y) {
        if (auto) { let stop; [si, stop] = controlClick(si, x, y); if (stop) go(Menu()); return; }
        if (inRect(MENU_BTN, x, y)) return go(Menu());
        if (result !== null) { blueFirst = !blueFirst; start(); return; }
        if (!mover()) {
          const m = rules.mouse(x, y);
          if (m !== null && rules.legal(s).includes(m)) move(m);
        }
      },
    };
  }

  // tic-tac-toe: board = array of 9, 1 = X (moves first), -1 = O
  const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  function tttWinner(b) {
    for (const [a, c, d] of LINES3) if (b[a] && b[a] === b[c] && b[c] === b[d]) return b[a];
    return b.includes(0) ? 0 : 2;
  }
  function tttFeatures(b) {
    const t = b.filter(v => v === 1).length === b.filter(v => v === -1).length ? 1 : -1;
    return [...b.map(v => (v * t === 1 ? 1 : 0)), ...b.map(v => (v * t === -1 ? 1 : 0))];
  }
  function TicTacToe() {
    const S = 160, X0 = (GAME_W - 480) / 2, Y0 = 50;
    return BoardGame("ttt", "틱택토", {
      create: () => new Array(9).fill(0),
      legal: b => b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0),
      play(b, i, p) { const nb = b.slice(); nb[i] = p; const w = tttWinner(nb); return [nb, w ? w : null]; },
      features: b => tttFeatures(b),
      mouse(x, y) {
        const c = Math.floor((x - X0) / S), r = Math.floor((y - Y0) / S);
        return c >= 0 && c < 3 && r >= 0 && r < 3 ? r * 3 + c : null;
      },
      draw(b, blue) {
        ctx.strokeStyle = DIM; ctx.lineWidth = 4;
        for (let k = 1; k < 3; k++) {
          ctx.beginPath(); ctx.moveTo(X0 + k * S, Y0); ctx.lineTo(X0 + k * S, Y0 + 3 * S); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(X0, Y0 + k * S); ctx.lineTo(X0 + 3 * S, Y0 + k * S); ctx.stroke();
        }
        ctx.lineWidth = 10;
        b.forEach((p, i) => {
          if (!p) return;
          const cx = X0 + (i % 3) * S + S / 2, cy = Y0 + Math.floor(i / 3) * S + S / 2;
          ctx.strokeStyle = p === blue ? HUMAN_C : BRAIN_C;
          ctx.beginPath();
          if (p === 1) {
            const d = 45;
            ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
            ctx.moveTo(cx - d, cy + d); ctx.lineTo(cx + d, cy - d);
          } else ctx.arc(cx, cy, 50, 0, 7);
          ctx.stroke();
        });
      },
    });
  }

  // connect four: board = 6x7 array of rows, row 0 is the top
  const ROWS = 6, COLS = 7;
  const c4Legal = b => [...Array(COLS).keys()].filter(c => b[0][c] === 0);
  function c4Drop(b, c, p) {
    const nb = b.map(r => r.slice());
    let r = ROWS - 1;
    while (nb[r][c] !== 0) r--;
    nb[r][c] = p;
    return [nb, r];
  }
  function c4Wins(b, r, c) {
    const p = b[r][c];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let k = 1;
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr][cc] === p) { k++; rr += dr * s; cc += dc * s; }
      }
      if (k >= 4) return true;
    }
    return false;
  }
  function c4Features(b, p) {
    const flat = b.flat().map(v => v * p);
    return [...flat.map(v => (v === 1 ? 1 : 0)), ...flat.map(v => (v === -1 ? 1 : 0))];
  }
  function ConnectFour() {
    const S = 78, X0 = (GAME_W - S * COLS) / 2, Y0 = 40;
    return BoardGame("c4", "사목", {
      create: () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0)),
      legal: c4Legal,
      play(b, c, p) {
        const [nb, r] = c4Drop(b, c, p);
        if (c4Wins(nb, r, c)) return [nb, p];
        return [nb, c4Legal(nb).length ? null : 2];
      },
      features: c4Features,
      mouse(x) { const c = Math.floor((x - X0) / S); return c >= 0 && c < COLS ? c : null; },
      draw(b, blue) {
        rrect(X0 - 8, Y0 - 8, S * COLS + 16, S * ROWS + 16, 12, "#23376e");
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const p = b[r][c];
          ctx.fillStyle = p === 0 ? BG : p === blue ? HUMAN_C : BRAIN_C;
          ctx.beginPath(); ctx.arc(X0 + c * S + S / 2, Y0 + r * S + S / 2, S / 2 - 6, 0, 7); ctx.fill();
        }
        const c = Math.floor((mouse.x - X0) / S);
        if (c >= 0 && c < COLS && mouse.x < GAME_W) {
          const cx = X0 + c * S + S / 2, by = Y0 + S * ROWS;
          ctx.fillStyle = DIM;
          ctx.beginPath(); ctx.moveTo(cx - 12, by + 16); ctx.lineTo(cx + 12, by + 16); ctx.lineTo(cx, by + 4); ctx.fill();
        }
      },
    });
  }

  // ------------------------------------------------------------ main loop (fixed 60 updates/s)
  go(Menu());
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc = Math.min(acc + (now - last), 250);
    last = now;
    while (acc >= 1000 / FPS) {
      scene.update && scene.update();
      acc -= 1000 / FPS;
    }
    scene.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
