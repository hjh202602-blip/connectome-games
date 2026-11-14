// Browser version of main.py: paddle ball against real connectome brains.
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
      if (e.key === "1" || e.key === "Enter") start(GAMES[0]);
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
  // who can play: insect brains and every trained version of the trained AI
  const PLAYERS = {
    worm: ["꼬마선충", "C. elegans 뉴런 302개 전부를 쓴 뇌 (Cook 2019)"],
    fly: ["초파리", "FlyWire 초파리 뇌에서 잘라낸 뉴런 2,000개 회로 (2024)"],
    v1: ["학습 AI v1", "혼자 연습해 회전 공을 읽고, 상대에게서 먼 쪽으로 휘어 치는 신경망"],
    v2: ["학습 AI v2", "v1이 꼬마선충·초파리 뇌와 겨루며 더 배운 신경망"],
    v3: ["학습 AI v3", "v2가 곤충 뇌, 그리고 v2 자신을 이기도록 더 크게 학습한 신경망"],
  };
  const isAI = k => /^(v\d+|ab:[01]{3})$/.test(k || "");
  const VERS = Object.keys(PLAYERS).filter(k => isAI(k) && (window.AI_DATA || {})[k]); // hide untrained AIs
  const TABS = [
    ["사람 vs 곤충 뇌", ["worm", "fly"]],
    ["사람 vs 학습 AI", VERS],
    ["대결", ["worm", "fly", ...VERS]],
    ["점수 방식 실험", window.ABL_DATA ? ["lab"] : []],
  ].filter(t => t[1].length);
  const sel = { tab: 0, 0: "worm", 1: VERS[0], 2: null, blue: "worm", orange: VERS[0] || "fly",
                lab: "111", labOpp: null, metric: "far" };
  const tabName = () => TABS[sel.tab][0];
  const pair = () => (tabName() === "대결" ? [sel.blue, sel.orange]
    : tabName() === "점수 방식 실험" ? [sel.labOpp, "ab:" + sel.lab] : [null, sel[sel.tab]]);
  function players(game) {
    return pair().map(k => (k === null ? null : isAI(k) ? makeAI(k) : BR[k][game]));
  }

  // ------------------------------------------------------------ trained AI (ordinary neural net, see ai.py)
  // 10 inputs -> 32 tanh -> 32 tanh -> 1 tanh. Weights come from web/ai.js (python export_web.py).
  function makeAI(ver) {
    const lab = ver.startsWith("ab:");
    const d = lab ? window.ABL_DATA.combos[ver.slice(3)] : window.AI_DATA[ver], H = d.hidden, th = d.theta, n = d.nIn;
    let k = 0;
    const take = m => { const a = th.slice(k, k + m); k += m; return a; };
    const W1 = take(n * H), b1 = take(H), W2 = take(H * H), b2 = take(H), W3 = take(H), b3 = take(1)[0];
    const lastState = new Float64Array(2 * H);
    return {
      wiring: { label: lab ? `실험 AI (${comboName(ver.slice(3))})` : `학습 AI ${ver}`, N: 2 * H, order: [...Array(2 * H).keys()],
                info: [`일반 신경망 ${n} → ${H} → ${H} → 1 (커넥톰 아님)`,
                       lab ? `점수 방식 실험: 보너스 ${comboName(ver.slice(3))}로 처음부터 ${d.gens}세대, 경기 ${d.games.toLocaleString()}판`
                           : `${({ v1: "스스로 연습", v2: "v1에서 곤충 뇌와 겨루며 연습" })[ver] || "v2에서 곤충 뇌·v2와 겨루며 연습"} · 모두 ${d.gens}세대, 경기 ${d.games.toLocaleString()}판`,
                       "사람과 같은 관성으로 움직임 · 회전·상대 위치까지 봄"] },
      lastState, prev: 0, vel: 0,
      act(x) {
        const h1 = new Float64Array(H), h2 = new Float64Array(H);
        for (let j = 0; j < H; j++) { let s = b1[j]; for (let i = 0; i < n; i++) s += x[i] * W1[i * H + j]; h1[j] = Math.tanh(s); }
        for (let j = 0; j < H; j++) { let s = b2[j]; for (let i = 0; i < H; i++) s += h1[i] * W2[i * H + j]; h2[j] = Math.tanh(s); }
        let o = b3; for (let i = 0; i < H; i++) o += h2[i] * W3[i];
        lastState.set(h1); lastState.set(h2, H);
        return (this.prev = Math.tanh(o));
      },
    };
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
  };
  const GAMES = [
    { key: "1", name: "패들볼", art: ART.paddle, input: "A/D · ←/→", make: () => PaddleBall(),
      desc: "공을 받아치세요. 판을 움직이면서 치면 회전이 걸려 휘고, 회전이 셀수록 공이 빨라져요." },
  ];

  // ------------------------------------------------------------ score-rule experiment (web/ablation.js)
  // The same AI trained from scratch 8 times, once per on/off combination of the 3 bonuses.
  const ABL = window.ABL_DATA;
  function comboName(key) {
    const on = ABL.bonus.filter((b, i) => key[i] === "1").map(b => b.name);
    return on.length ? on.join("+") + " 켬" : "보너스 없음";
  }
  const pct = x => `${Math.round(x * 100)}%`;
  const net = wl => (wl ? (wl[0] - wl[1]) / ABL.evalRallies : 0); // points won - lost per 60 s rally
  const signed = x => (x > 0 ? "+" : "") + x.toFixed(2);
  // [id, name, value from a combo's test results, text, higher is better]
  const LAB_STATS = [
    ["worm", "꼬마선충 상대 60초당 득실", e => net(e.worm), signed, true],
    ["fly", "초파리 상대 60초당 득실", e => net(e.fly), signed, true],
    ["pred", "예측 상대에게 잃은 점수 (60초당)", e => (e.pred ? e.pred[1] / ABL.evalRallies : 0), x => x.toFixed(2), false],
    ["spin", "친 공의 평균 회전", e => e.spin || 0, pct, true],
    ["far", "상대에게서 먼 쪽으로", e => e.far || 0, pct, true],
    ["hits", "60초 동안 받아친 공", e => e.hits || 0, x => x.toFixed(1), true],
  ];
  // learning curves recorded during training
  const LAB_CURVES = {
    far: ["먼 쪽으로", pct], spin: ["회전", pct], hits: ["받아친 공 (20초)", x => x.toFixed(1)],
    pred: ["예측 상대 득실 (20초)", x => (x > 0 ? "+" : "") + x.toFixed(2)],
  };
  function smooth(a, k = 10) {
    return a.map((_, i) => { const s = a.slice(Math.max(0, i - k + 1), i + 1); return s.reduce((p, q) => p + q, 0) / s.length; });
  }
  function labChart() {
    const [name, fmt] = LAB_CURVES[sel.metric], keys = Object.keys(ABL.combos);
    const lines = Object.fromEntries(keys.map(k => [k, smooth(ABL.combos[k].hist[sel.metric])]));
    const all = Object.values(lines).flat(), lo = Math.min(...all), hi = Math.max(...all), n = ABL.gens;
    const VW = 640, VH = 220, L = 52, R = 12, T = 12, B = 26;
    const X = i => L + (VW - L - R) * i / (n - 1), Y = v => T + (VH - T - B) * (1 - (v - lo) / (hi - lo || 1));
    const path = a => a.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
    let svg = "";
    for (let j = 0; j <= 3; j++) {
      const v = lo + (hi - lo) * j / 3;
      svg += `<line x1="${L}" x2="${VW - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/>
              <text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    for (let g = 0; g <= n; g += 50) svg += `<text x="${X(Math.max(g - 1, 0))}" y="${VH - 6}" text-anchor="middle">${g}</text>`;
    const order = keys.filter(k => k !== sel.lab && k !== "111").concat(sel.lab !== "111" ? ["111"] : [], [sel.lab]);
    for (const k of order) {
      const me = k === sel.lab, full = k === "111" && !me;
      svg += `<path d="${path(lines[k])}" fill="none" stroke="${me ? "var(--orange)" : full ? "var(--blue)" : "var(--line-2)"}"
               stroke-width="${me ? 2.6 : full ? 1.8 : 1.2}" ${full ? 'stroke-dasharray="5 4"' : ""}/>`;
    }
    return `<div class="lab-chart panel">
      <div class="lab-chart-head"><strong>학습 곡선</strong>
        <div class="seg">${Object.entries(LAB_CURVES).map(([id, [nm]]) =>
          `<button data-metric="${id}" aria-pressed="${id === sel.metric}">${nm}</button>`).join("")}</div></div>
      <svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="세대별 ${name}">${svg}</svg>
      <div class="lab-legend"><span><i class="sw o"></i>고른 조합 (${comboName(sel.lab)})</span>
        ${sel.lab !== "111" ? '<span><i class="sw b"></i>모두 켬</span>' : ""}<span><i class="sw g"></i>나머지 조합</span>
        <span class="muted">가로: 세대 · 10세대 평균</span></div></div>`;
  }
  function renderLab() {
    const e = ABL.combos[sel.lab].eval, base = ABL.combos["111"].eval;
    const toggles = ABL.bonus.map((b, i) =>
      `<button class="switch" data-bit="${i}" aria-pressed="${sel.lab[i] === "1"}"><span class="knob"></span>${b.name} 보너스</button>`).join("");
    const opps = [[null, "나 (사람)"], ["worm", "꼬마선충"], ["fly", "초파리"], ["ab:111", "모두 켠 AI"]];
    const cards = LAB_STATS.map(([id, nm, get, fmt, up]) => {
      const v = get(e), d = v - get(base), same = sel.lab === "111" || Math.abs(d) < 1e-9;
      const good = (d > 0) === up;
      return `<div class="stat-card"><span class="nm">${nm}</span><span class="val">${fmt(v)}</span>
        <span class="cmp ${same ? "" : good ? "up" : "down"}">${same ? "모두 켠 조합 기준" : `모두 켬 ${fmt(get(base))} 대비 ${d > 0 ? "▲" : "▼"}`}</span></div>`;
    }).join("");
    const rows = Object.keys(ABL.combos).map(k => {
      const ek = ABL.combos[k].eval;
      return `<tr data-combo="${k}" aria-selected="${k === sel.lab}">
        ${ABL.bonus.map((b, i) => `<td class="dot">${k[i] === "1" ? "●" : "○"}</td>`).join("")}
        ${LAB_STATS.map(([, , get, fmt]) => `<td>${fmt(get(ek))}</td>`).join("")}</tr>`;
    }).join("");
    return `<div class="lab">
      <div class="lab-toggles">${toggles}</div>
      <div class="pick-row"><span class="side">상대</span>${opps.map(([k, nm]) =>
        `<button class="pick" data-labopp="${k || ""}" aria-pressed="${k === sel.labOpp}">${nm}</button>`).join("")}</div>
      <div class="stat-grid">${cards}</div>
      ${labChart()}
      <div class="table-wrap"><table class="lab-table">
        <thead><tr>${ABL.bonus.map(b => `<th>${b.name}</th>`).join("")}${LAB_STATS.map(s => `<th>${s[1]}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="muted">시험: 조합마다 ${ABL.evalRallies}판 × 60초. 학습에는 운이 섞여서, 같은 조합도 다시 학습시키면 결과가 조금 달라질 수 있어요.</p>
    </div>`;
  }

  function renderMenu() {
    const t = sel.tab, versus = TABS[t][0] === "대결", lab = TABS[t][0] === "점수 방식 실험";
    const watch = versus || (lab && sel.labOpp !== null);
    $("tabs").innerHTML = TABS.map(([n], k) =>
      `<button class="tab" role="tab" data-tab="${k}" aria-selected="${k === t}">${n}</button>`).join("");
    const row = (slot, chosen, side) => `<div class="pick-row">${side || ""}${TABS[t][1].map(k =>
      `<button class="pick" data-slot="${slot}" data-key="${k}" aria-pressed="${k === chosen}">${PLAYERS[k][0]}</button>`).join("")}</div>`;
    $("picks").innerHTML = lab ? renderLab() : versus
      ? row("blue", sel.blue, '<span class="side b">파랑 (아래)</span>') + row("orange", sel.orange, '<span class="side o">주황 (위)</span>')
      : row(t, sel[t]);
    $("pick-desc").textContent = lab
      ? `학습할 때 점수에 더하는 보너스를 켜고 끄면, 그 조합으로 처음부터 ${ABL.gens}세대 학습시킨 AI로 바뀝니다. 득점은 항상 점수에 들어가요. `
        + `지금: ${comboName(sel.lab)} · 상대 ${sel.labOpp === null ? "나" : sel.labOpp === "ab:111" ? "모두 켠 AI" : PLAYERS[sel.labOpp][0]}`
      : versus
      ? `${PLAYERS[sel.blue][0]}(파랑) vs ${PLAYERS[sel.orange][0]}(주황) · 대결을 구경합니다. 배속 조절과 그만 보기가 있어요`
      : PLAYERS[sel[t]][1];
    $("games").innerHTML = GAMES.map((g, k) =>
      `<button class="card game" data-game="${k}">${g.art}
         <div class="body"><span class="name">${g.name} <span class="kbd">${g.key}</span></span>
         <span class="desc">${g.desc}</span><span class="desc">조작: ${watch ? "구경만 해요" : g.input}</span>
         <span class="play">${watch ? "구경하기" : "플레이"} →</span></div></button>`).join("");
  }
  $("tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (b) { sel.tab = +b.dataset.tab; renderMenu(); }
  });
  $("picks").addEventListener("click", e => {
    const b = e.target.closest("[data-slot],[data-bit],[data-labopp],[data-metric],[data-combo]");
    if (!b) return;
    const d = b.dataset;
    if (d.slot !== undefined) sel[d.slot] = d.key;
    else if (d.bit !== undefined) { const a = [...sel.lab]; a[+d.bit] = a[+d.bit] === "1" ? "0" : "1"; sel.lab = a.join(""); }
    else if (d.labopp !== undefined) sel.labOpp = d.labopp || null;
    else if (d.metric) sel.metric = d.metric;
    else if (d.combo) sel.lab = d.combo;
    renderMenu();
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

  // ------------------------------------------------------------ paddle ball (same rules as paddle.py)
  const pongFeatures = (bx, by, vx, vy, py) => [bx * 2 - 1, by * 2 - 1, vx * 40, vy * 40, py * 2 - 1, (by - py) * 2];
  const PH = 0.18, BRAIN_SPD = 0.018, SERVE_V = 0.01;
  // Spin is stored as "paddle speed it came from": hitting while moving the same way adds,
  // moving the other way cancels or flips it. The ball curves against its spin (Magnus),
  // and the more it spins, the faster it flies (up to 1 + SPIN_SPEED times).
  const PUSH = 0.4, CURVE = 0.012, SPIN_DECAY = 0.993, VY_MAX = 0.03, SPIN_GAIN = 1.2, SPIN_MAX = 0.05, SPIN_SPEED = 1.0;
  const speedFactor = spin => 1 + SPIN_SPEED * Math.min(Math.abs(spin) / SPIN_MAX, 1);
  // a ball as seen from `side` (+1 orange, -1 blue): mirrored so everyone sits at x = 0.97
  function view(ball, side) {
    const [bx, by, vx, vy, spin] = ball, f = speedFactor(spin);
    return side < 0 ? [1 - bx, by, -vx * f, vy * f, spin] : [bx, by, vx * f, vy * f, spin];
  }
  function decide(p, ball, side, me, opp) {
    const [bx, by, vx, vy, spin] = view(ball, side);
    if (p.act) return p.act([bx * 2 - 1, by * 2 - 1, vx * 40, vy * 40, spin / SPIN_MAX, me * 2 - 1, (by - me) * 2, opp * 2 - 1, p.prev, p.vel * 50]);
    return p.predict(pongFeatures(bx, by, vx, vy, me))[0];
  }
  // Human paddle and my AI have inertia: a push accelerates them, friction slows them down,
  // they stop dead at the wall. The insect brains move their paddle directly.
  const HUMAN_ACC = 0.0025, FRICTION = 0.88;
  function inertia(o, pos, push) { // o.vel is updated; returns the new position
    o.vel = (o.vel + HUMAN_ACC * clip(push, -1, 1)) * FRICTION;
    const p = pos + o.vel;
    if (!(p > PH / 2 && p < 1 - PH / 2)) o.vel = 0;
    return clip(p, PH / 2, 1 - PH / 2);
  }
  function movePaddle(p, ball, side, me, opp) {
    const out = decide(p, ball, side, me, opp);
    return p.act ? inertia(p, me, out) : clip(me + BRAIN_SPD * clip(out, -1, 1), PH / 2, 1 - PH / 2);
  }

  function PaddleBall() {
    const [left, right] = players("pong"); // left (bottom) null = human
    const auto = !!left;
    const GOAL = 7;
    const st = { score: [0, 0], hy: 0.5, vel: 0, by: 0.5, serveDir: 1, ball: null, winner: null, angle: 0, trail: [], wait: 0 };
    setupPanel("패들볼", [left, right], auto ? [] : [
      "아래 파란 판: A/D 또는 ←/→ (관성이 있어요)", "SPACE로 서브",
      "움직이면서 치면 회전이 걸려 휘어요", "회전 방향으로 치면 더 세게, 반대면 약해지거나 뒤집혀요",
      "회전이 셀수록 공이 빨라져요 (최대 2배)", `${GOAL}점 먼저 내면 승리`,
    ], auto);

    function serve(d) {
      const a = (Math.random() * 2 - 1) * 0.6;
      return [0.5, 0.5, d * SERVE_V * Math.cos(a), SERVE_V * Math.sin(a), 0];
    }
    function step() {
      const oldH = st.hy, oldB = st.by, ball = st.ball;
      if (!left) {
        const push = (held.has("d") || held.has("arrowright")) - (held.has("a") || held.has("arrowleft"));
        st.hy = inertia(st, st.hy, push);
      } else if (ball) st.hy = movePaddle(left, ball, -1, st.hy, st.by);
      if (auto && !ball) {
        st.wait++;
        if (st.winner && st.wait > 180) { st.score = [0, 0]; st.winner = null; st.wait = 0; }
        else if (!st.winner && st.wait > 50) { st.ball = serve(st.serveDir); st.trail = []; st.wait = 0; }
      }
      if (!ball) return;
      st.by = movePaddle(right, ball, 1, st.by, st.hy);
      let [bx, by, vx, vy, spin] = ball;
      const vel = { "-1": st.hy - oldH, "1": st.by - oldB };
      vy = clip(vy - spin * CURVE, -VY_MAX, VY_MAX);
      spin *= SPIN_DECAY;
      st.angle += spin * 30;
      const f = speedFactor(spin);
      bx += vx * f; by += vy * f;
      if (by < 0 || by > 1) { vy = -vy; by = clip(by, 0, 1); spin *= 0.7; }
      for (const [px, py, side] of [[0.03, st.hy, -1], [0.97, st.by, 1]]) {
        if ((bx - px) * side >= 0 && vx * side > 0 && Math.abs(by - py) < PH / 2 + 0.01) {
          vx = -vx;
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
        const level = ball ? speedFactor(ball[4]) : 1;
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
