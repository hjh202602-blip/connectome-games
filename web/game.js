// Browser version of main.py: paddle ball, tic-tac-toe and four-in-a-row against real connectome brains.
// The menu and the side panel are HTML (index.html); only the game board is drawn on the canvas.
(function () {
  "use strict";
  const W = 640, H = 640, GAME_W = 640, FPS = 60;
  const BG = "#12141c", FG = "#e6e8f0", DIM = "#787d8c";
  const HUMAN_C = "#5aaaff", BRAIN_C = "#ff9646";
  const FONT = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  const F_BIG = `bold 40px ${FONT}`, F_MID = `bold 24px ${FONT}`, F_SMALL = `17px ${FONT}`;
  const $ = id => document.getElementById(id);

  const canvas = $("c");
  const ctx = canvas.getContext("2d");
  const BR = ConnectomeBrain.loadBrains(window.BRAIN_DATA);
  $("loading").remove();

  // ------------------------------------------------------------ input
  const mouse = { x: -1, y: -1 };
  const held = new Set();
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener("mousemove", e => Object.assign(mouse, toCanvas(e)));
  canvas.addEventListener("mouseleave", () => Object.assign(mouse, { x: -1, y: -1 }));
  canvas.addEventListener("pointerdown", e => { const p = toCanvas(e); Object.assign(mouse, p); scene && scene.click && scene.click(p.x, p.y); });
  window.addEventListener("keydown", e => {
    if ($("credits").open) return; // let the credits dialog handle keys
    if (!scene) { // menu: number keys start a game
      if (e.key >= "1" && e.key <= "3") start(GAMES[+e.key - 1]);
      return;
    }
    if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
    held.add(e.key.toLowerCase());
    if (isQuit(e.key)) return showMenu();
    if (scene.auto) setSpeed(controlKey(si, e.key));
    scene.key && scene.key(e.key);
  });
  window.addEventListener("keyup", e => held.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => held.clear());

  // ------------------------------------------------------------ canvas helpers
  function text(s, font, color, x, y, center = false) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = center ? "center" : "left";
    ctx.textBaseline = center ? "middle" : "top";
    ctx.fillText(s, x, y);
  }
  function rrect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill; ctx.fill();
  }
  function activityColor(a) {
    a = Math.max(-1, Math.min(1, a));
    return a > 0 ? `rgb(${40 + 215 * a | 0},${40 + 110 * a | 0},40)` : `rgb(40,${40 - 90 * a | 0},${40 - 215 * a | 0})`;
  }

  // ------------------------------------------------------------ side panel (HTML)
  const SPEEDS = [1, 2, 4, 8];
  let si = 0; // speed index for brain-vs-brain
  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const nameOf = p => (p ? p.wiring.label : "사람");
  let grids = [], lastStats = "";

  function gridShape(brain, compact) {
    if (brain.wiring.N <= 400) return compact ? [30, 9, 1] : [18, 17, 2];
    return [58, 5, 0];
  }
  // title, [blue, orange] players, help lines; auto = brain vs brain
  function setupPanel(title, seats, help, auto) {
    $("g-title").textContent = title;
    $("matchup").innerHTML = `<span class="chip blue">${esc(nameOf(seats[0]))}</span> vs ` +
      `<span class="chip orange">${esc(nameOf(seats[1]))}</span>`;
    $("help").innerHTML = help.map(s => `<li>${esc(s)}</li>`).join("");
    $("help").hidden = !help.length;
    $("controls").hidden = !auto;
    $("stats").innerHTML = ""; lastStats = "";
    setSpeed(0);
    const box = $("brains");
    box.innerHTML = "";
    const brains = seats.filter(b => b), compact = brains.length > 1;
    grids = brains.map(b => {
      const wr = b.wiring, [cols, cell] = gridShape(b, compact);
      const div = document.createElement("div");
      div.className = "panel brain";
      div.innerHTML = `<h3>${esc(wr.label)} 뇌 · 뉴런 ${wr.N.toLocaleString()}개 활동</h3>`;
      const cv = document.createElement("canvas");
      cv.width = cols * cell; cv.height = Math.ceil(wr.N / cols) * cell;
      div.appendChild(cv);
      div.insertAdjacentHTML("beforeend",
        `<div class="legend">억제<span class="bar"></span>흥분</div>` +
        (compact ? "" : `<ul>${wr.info.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`));
      box.appendChild(div);
      return { brain: b, ctx: cv.getContext("2d"), compact };
    });
  }
  // rows: [label, html] pairs; only touches the DOM when something changed
  function setStats(rows) {
    const html = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("");
    if (html !== lastStats) { $("stats").innerHTML = html; lastStats = html; }
  }
  function drawGrids() {
    for (const { brain, ctx: g, compact } of grids) {
      const wr = brain.wiring, v = brain.lastState, [cols, cell, gap] = gridShape(brain, compact);
      g.clearRect(0, 0, g.canvas.width, g.canvas.height);
      for (let k = 0; k < wr.N; k++) {
        g.fillStyle = activityColor(v[wr.order[k]]);
        g.fillRect((k % cols) * cell, Math.floor(k / cols) * cell, cell - gap, cell - gap);
      }
    }
  }
  function setSpeed(i) { si = i; $("speed").textContent = `×${SPEEDS[si]}`; }
  function controlKey(i, k) {
    if (["+", "=", "f", "F"].includes(k)) return Math.min(i + 1, SPEEDS.length - 1);
    if (["-", "_"].includes(k)) return Math.max(i - 1, 0);
    return i;
  }
  const isQuit = k => k === "Escape" || k === "q" || k === "Q";
  $("faster").onclick = () => setSpeed(controlKey(si, "+"));
  $("slower").onclick = () => setSpeed(controlKey(si, "-"));
  $("stop").onclick = () => showMenu();
  $("back").onclick = () => showMenu();
  $("home").onclick = () => showMenu();
  $("credits-btn").onclick = () => $("credits").showModal();
  $("fs-btn").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  document.addEventListener("fullscreenchange", () => {
    $("fs-btn").textContent = document.fullscreenElement ? "창 모드" : "전체화면";
  });

  // ------------------------------------------------------------ modes & menu
  const MODES = [
    ["사람 vs 꼬마선충", "C. elegans 뉴런 302개 전부를 쓴 뇌 (Cook 2019)"],
    ["사람 vs 초파리", "FlyWire 초파리 뇌에서 잘라낸 뉴런 2,000개 회로 (2024)"],
    ["꼬마선충 vs 초파리", "두 뇌끼리 대결을 구경합니다. 배속 조절과 그만 보기가 있어요"],
  ];
  let mode = 0;
  function players(game) {
    if (mode === 2) return [BR.worm[game], BR.fly[game]];
    return [null, BR[mode === 0 ? "worm" : "fly"][game]];
  }
  function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random()); }
  const clip = (x, a, b) => Math.max(a, Math.min(b, x));

  // small preview pictures on the game cards
  const ART = {
    paddle: `<svg viewBox="0 0 300 130"><rect x="40" y="20" width="220" height="90" rx="6" fill="none" stroke="#2a2f40"/>
      <line x1="40" y1="65" x2="260" y2="65" stroke="#323746" stroke-dasharray="8 6" stroke-width="3"/>
      <rect x="150" y="24" width="56" height="7" rx="3" fill="#ff9646"/><rect x="86" y="99" width="56" height="7" rx="3" fill="#5aaaff"/>
      <path d="M118 96 Q 190 70 160 40" fill="none" stroke="#c86aa0" stroke-width="2.5" stroke-dasharray="3 5"/>
      <circle cx="160" cy="40" r="6" fill="#e6e8f0"/></svg>`,
    ttt: `<svg viewBox="0 0 300 130"><g stroke="#4a5068" stroke-width="3"><line x1="128" y1="18" x2="128" y2="112"/>
      <line x1="172" y1="18" x2="172" y2="112"/><line x1="104" y1="47" x2="196" y2="47"/><line x1="104" y1="83" x2="196" y2="83"/></g>
      <g stroke="#5aaaff" stroke-width="5" stroke-linecap="round"><path d="M108 22l16 18M124 22l-16 18M152 56l16 18M168 56l-16 18"/></g>
      <g fill="none" stroke="#ff9646" stroke-width="5"><circle cx="150" cy="31" r="9"/><circle cx="184" cy="65" r="9"/></g></svg>`,
    c4: `<svg viewBox="0 0 300 130"><rect x="85" y="14" width="130" height="104" rx="8" fill="#23376e"/>
      ${[...Array(24).keys()].map(i => {
        const r = Math.floor(i / 6), c = i % 6;
        const filled = { "3,1": "#5aaaff", "3,2": "#ff9646", "3,3": "#5aaaff", "2,2": "#5aaaff", "2,3": "#ff9646", "1,3": "#ff9646", "3,4": "#ff9646", "2,4": "#5aaaff" }[`${r},${c}`];
        return `<circle cx="${102 + c * 19.2}" cy="${30 + r * 24}" r="8" fill="${filled || "#12141c"}"/>`;
      }).join("")}</svg>`,
  };
  const GAMES = [
    { key: "1", name: "패들볼", art: ART.paddle, input: "A/D · ←/→", make: () => PaddleBall(),
      desc: "공을 받아치세요. 판을 움직이면서 치면 회전이 걸려 휘어요. 공은 랠리할수록 빨라집니다." },
    { key: "2", name: "틱택토", art: ART.ttt, input: "클릭", make: () => TicTacToe(),
      desc: "3×3 칸에 자기 표시로 한 줄을 먼저 만들면 이깁니다." },
    { key: "3", name: "사목", art: ART.c4, input: "클릭", make: () => FourInARow(),
      desc: "돌을 떨어뜨려 가로·세로·대각선으로 4개를 먼저 이으면 이깁니다." },
  ];

  function renderMenu() {
    $("modes").innerHTML = MODES.map(([n, d], k) =>
      `<button class="card mode" data-mode="${k}" aria-pressed="${k === mode}">
         <span class="name">${n}</span><span class="desc">${d}</span></button>`).join("");
    $("games").innerHTML = GAMES.map((g, k) =>
      `<button class="card game" data-game="${k}">${g.art}
         <div class="body"><span class="name">${g.name} <span class="kbd">${g.key}</span></span>
         <span class="desc">${g.desc}</span><span class="desc">조작: ${g.input}</span>
         <span class="play">플레이 →</span></div></button>`).join("");
  }
  $("modes").addEventListener("click", e => {
    const b = e.target.closest("[data-mode]");
    if (b) { mode = +b.dataset.mode; renderMenu(); }
  });
  $("games").addEventListener("click", e => {
    const b = e.target.closest("[data-game]");
    if (b) start(GAMES[+b.dataset.game]);
  });

  let scene = null;
  function showMenu() {
    scene = null; held.clear();
    $("menu").hidden = false; $("play").hidden = true; $("footer").hidden = false;
    document.querySelector("main").classList.remove("wide");
    renderMenu();
  }
  function start(game) {
    $("menu").hidden = true; $("play").hidden = false; $("footer").hidden = true;
    document.querySelector("main").classList.add("wide");
    scene = game.make();
    window.scrollTo(0, 0);
    canvas.focus && canvas.focus();
  }

  // ------------------------------------------------------------ paddle ball
  const pongFeatures = (bx, by, vx, vy, py) => [bx * 2 - 1, by * 2 - 1, vx * 40, vy * 40, py * 2 - 1, (by - py) * 2];

  function PaddleBall() {
    const [left, right] = players("pong"); // left (bottom) null = human
    const auto = !!left;
    const PH = 0.18, BRAIN_SPD = 0.018, GOAL = 7;
    // Spin is stored as "paddle speed it came from": hitting while moving the same way adds,
    // moving the other way cancels or flips it. The ball curves against its spin (Magnus).
    const PUSH = 0.4, CURVE = 0.012, SPIN_DECAY = 0.993, VY_MAX = 0.03, SPIN_GAIN = 1.2, SPIN_MAX = 0.05;
    // Ball speeds up at every centre-line crossing; spin and sideways limits grow with it.
    const SERVE_V = 0.01, CROSS_ACC = 1.05, V_MAX = 0.03;
    // Human paddle has inertia: keys accelerate it, friction slows it down.
    const HUMAN_ACC = 0.0025, FRICTION = 0.88;
    const st = { score: [0, 0], hy: 0.5, hv: 0, by: 0.5, serveDir: 1, ball: null, winner: null, angle: 0, trail: [], wait: 0 };
    setupPanel("패들볼", [left, right], auto ? [] : [
      "아래 파란 판: A/D 또는 ←/→ (관성이 있어요)", "SPACE로 서브",
      "움직이면서 치면 회전이 걸려 휘어요", "회전 방향으로 치면 더 세게, 반대면 약해지거나 뒤집혀요",
      "공은 중앙선을 넘을 때마다 빨라지고, 그만큼 회전도 더 세게 걸려요", `${GOAL}점 먼저 내면 승리`,
    ], auto);

    function serve(d) {
      const a = (Math.random() * 2 - 1) * 0.6;
      return [0.5, 0.5, d * SERVE_V * Math.cos(a), SERVE_V * Math.sin(a), 0];
    }
    function step() {
      const oldH = st.hy, oldB = st.by, ball = st.ball;
      if (!left) {
        const push = (held.has("d") || held.has("arrowright")) - (held.has("a") || held.has("arrowleft"));
        st.hv = (st.hv + HUMAN_ACC * push) * FRICTION;
        st.hy += st.hv;
        if (!(st.hy > PH / 2 && st.hy < 1 - PH / 2)) st.hv = 0; // stops dead at the wall
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
      const level = Math.abs(vx) / SERVE_V, vyMax = VY_MAX * level, spinMax = SPIN_MAX * level;
      vy = clip(vy - spin * CURVE, -vyMax, vyMax);
      spin *= SPIN_DECAY;
      st.angle += spin * 30;
      if ((bx - 0.5) * (bx + vx - 0.5) < 0) { // crossing the centre line -> speed up
        const k = Math.min(Math.abs(vx) * CROSS_ACC, V_MAX) / Math.abs(vx);
        vx *= k; vy *= k;
      }
      bx += vx; by += vy;
      if (by < 0 || by > 1) { vy = -vy; by = clip(by, 0, 1); spin *= 0.7; }
      for (const [px, py, side] of [[0.03, st.hy, -1], [0.97, st.by, 1]]) {
        if ((bx - px) * side >= 0 && vx * side > 0 && Math.abs(by - py) < PH / 2 + 0.01) {
          vx = -vx;
          const pv = vel[side];
          vy = clip(vy + (by - py) * 0.06 + pv * PUSH, -vyMax, vyMax);
          spin = clip(spin + pv * SPIN_GAIN, -spinMax, spinMax);
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
        const level = ball ? Math.abs(ball[2]) / SERVE_V : 1;
        const amt = ball ? Math.min(Math.abs(ball[4]) / (SPIN_MAX * level), 1) : 0;
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
        setStats([
          ["점수", `<span style="color:${HUMAN_C}">${st.score[0]}</span> : <span style="color:${BRAIN_C}">${st.score[1]}</span>`],
          ["공 속도", `×${level.toFixed(1)}`],
          ["회전", `<span class="meter"><i style="width:${Math.round(amt * 100)}%"></i></span>${dir}`],
          ["목표", `${GOAL}점`],
        ]);
      },
      auto,
      key(k) {
        if (k === " ") {
          if (st.winner) { st.score = [0, 0]; st.winner = null; }
          if (!st.ball) { st.ball = serve(st.serveDir); st.trail = []; }
        }
      },
    };
  }

  // ------------------------------------------------------------ board games
  // Turn loop shared by the board games. seats = [blue, orange]; null = human.
  // The two seats swap who moves first each game. blueSide = 1 when blue moves first.
  function BoardGame(game, title, rules) {
    const seats = players(game);
    const auto = seats.every(p => p);
    let blueFirst = true, stats = [0, 0, 0];
    setupPanel(title, seats, auto ? [] : [rules.help, "판마다 선공이 바뀌어요", "판이 끝나면 클릭해서 다음 판"], auto);
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
        const first = blueSide === 1 ? 0 : 1;
        setStats([
          ["이번 판 선공", `<span style="color:${first ? BRAIN_C : HUMAN_C}">${esc(nameOf(seats[first]))}</span>`],
          ["전적", `<span style="color:${HUMAN_C}">${stats[0]}승</span> : <span style="color:${BRAIN_C}">${stats[1]}승</span>`],
          ["무승부", `${stats[2]}`],
        ]);
      },
      auto,
      click(x, y) {
        if (auto) return;
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
      help: "빈 칸을 클릭해서 두세요",
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

  // four in a row: board = 6x7 array of rows, row 0 is the top
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
  function FourInARow() {
    const S = 78, X0 = (GAME_W - S * COLS) / 2, Y0 = 40;
    return BoardGame("c4", "사목", {
      help: "열을 클릭하면 돌이 맨 아래로 떨어져요",
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
  showMenu();
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc = Math.min(acc + (now - last), 250);
    last = now;
    if (scene) {
      while (acc >= 1000 / FPS) {
        scene.update();
        acc -= 1000 / FPS;
      }
      scene.draw();
      drawGrids();
    } else acc = 0;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
