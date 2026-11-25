import { meter, judge, makeCourse, flipsFor, pancakeSnack, GRADES, PANS, MAX_POINTS } from "./pancake-logic.js";

const CSS = `
.pk-hud { display: flex; align-items: center; gap: 10px; text-align: left; }
.pk-hud .pk-text { flex: 1; min-width: 0; }
.pk-hud .prompt { margin: 0; }
.pk-dots { display: flex; gap: 6px; margin-top: 4px; }
.pk-dots i { width: 14px; height: 14px; border-radius: 50%; background: var(--line); }
.pk-dots i.done { background: #ffb347; }
.pk-dots i.now { box-shadow: 0 0 0 3px #ffd23f; }
.pk-dots i.mouth { border-radius: 4px; }
.pk-score { flex: 0 0 auto; font-size: 1.5rem; font-weight: 900; }
.pk-stage { position: relative; margin-top: 10px; border-radius: 20px; overflow: hidden; }
.pk-stage canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.pk-hint { position: absolute; left: 0; right: 0; bottom: 12px; text-align: center; font-weight: 900; font-size: 1.15rem;
  pointer-events: none; text-shadow: 0 2px 4px #000; animation: pk-pulse 1.4s ease-in-out infinite; }
@keyframes pk-pulse { 50% { transform: scale(1.08); } }
.pk-done { display: grid; gap: 10px; margin-top: 12px; text-align: center; }
.pk-done .prompt { font-size: 1.6rem; }
`;

const TITLE = "Pancake Flip 🥞";
const GAP = 6;
const PAN_R = 1.1;
const MOUTH_R = 0.75;
const PITCH = 0.42;

let ui;

function addStyle() {
  if (document.getElementById("pancake-css")) return;
  document.head.append(Object.assign(document.createElement("style"), { id: "pancake-css", textContent: CSS }));
}

export function pancake(kit) {
  ui = kit;
  addStyle();
  play();
}

const panPos = (i) => ({ x: i % 2 ? 1.1 : -1.1, y: 0, z: i * GAP });
const mouthPos = () => ({ x: 0, y: 1.25, z: PANS * GAP });
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

function play() {
  const { h, screen, say, speak, celebrate, tone, boop, store } = ui;
  const course = makeCourse();
  const snack = pancakeSnack();
  let hop = 0;
  let points = 0;

  const canvas = h("canvas", { "aria-label": "Hold to flip the pancake, let go to toss it" });
  const hint = h("div", { class: "pk-hint" }, "👆 Hold… then let go!");
  const scoreEl = h("div", { class: "pk-score" }, "🥞 0");
  const dots = h("div", { class: "pk-dots" });
  const label = h("div", { class: "prompt" });
  const done = h("div");
  const drawHud = () => {
    label.textContent = hop >= PANS ? "All done! 😋" : course[hop].mouth ? "Flip it into the mouth!" : `Flip to pan ${hop + 2}!`;
    scoreEl.textContent = `🥞 ${points}`;
    dots.replaceChildren(...course.map((c, i) =>
      h("i", { class: [i < hop ? "done" : "", i === hop ? "now" : "", c.mouth ? "mouth" : ""].join(" ") })));
  };
  drawHud();

  screen(TITLE,
    h("div", { class: "card compact" },
      h("div", { class: "pk-hud" },
        h("div", { class: "pk-text" }, label, dots),
        scoreEl,
        h("button", { class: "say round", "aria-label": "Hear it", onclick: () => speak("Hold your finger down. Let go when the line is in the gold!") }, "🔊"))),
    h("div", { class: "pk-stage" }, canvas, hint),
    done);
  say(`Pancake ${snack.letter}! Hold, then let go in the gold!`);

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, F = 0;
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = Math.round(Math.min(innerHeight * 0.6, W * 1.35));
    canvas.style.height = `${H}px`;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = W * 1.05;
  };
  size();
  addEventListener("resize", size);

  // ---- state ----
  let state = "ready"; // ready | hold | fly | land | miss | eaten
  let holdStart = 0;
  let power = 0;
  let fly = null;
  let popup = null;
  let squash = 0;
  let chomp = 0;
  let cam = camFor(0);
  let camFrom = cam, camTo = cam, camT = 1;
  let osc = null;

  function camFor(i) {
    const p = panPos(i);
    return { x: p.x * 0.45, y: 3.6, z: p.z - 4.8 };
  }

  function project(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    const c = Math.cos(PITCH), s = Math.sin(PITCH);
    const y2 = dy * c + dz * s;
    const z2 = -dy * s + dz * c;
    if (z2 < 0.2) return null;
    return { x: W / 2 + (F * dx) / z2, y: H * 0.42 - (F * y2) / z2, d: z2 };
  }

  const circlePath = (cx, cy, cz, r, n = 32) => {
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const p = project(cx + r * Math.cos(a), cy, cz + r * Math.sin(a));
      if (!p) return false;
      k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.closePath();
    return true;
  };

  // ---- audio ----
  function hum(on) {
    try {
      if (on && !osc) {
        const a = ui.audio();
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sine";
        g.gain.value = 0.05;
        o.connect(g).connect(a.destination);
        o.start();
        osc = { o, g };
      } else if (!on && osc) {
        osc.o.stop();
        osc = null;
      }
    } catch { osc = null; }
  }

  // ---- input ----
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "ready") return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    state = "hold";
    holdStart = performance.now();
    power = 0;
    hint.hidden = true;
    hum(true);
  });
  const release = () => {
    if (state !== "hold") return;
    hum(false);
    launch(power);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function launch(p) {
    const c = course[hop];
    const r = judge(p, c.target, c.scale);
    const from = { ...panPos(hop), y: 0.18 };
    const goal = c.mouth ? mouthPos() : { ...panPos(hop + 1), y: 0.18 };
    const dx = goal.x - from.x, dz = goal.z - from.z;
    const len = Math.hypot(dx, dz);
    const reach = (c.mouth ? MOUTH_R : PAN_R) * 0.85;
    const off = r.landed ? r.offset : Math.sign(r.offset) * Math.max(Math.abs(r.offset), 1.6);
    const end = { x: goal.x + (dx / len) * off * reach, y: r.landed ? goal.y : 0.04, z: goal.z + (dz / len) * off * reach };
    fly = { from, end, t0: performance.now(), dur: 950 + flipsFor(p) * 120, flips: r.landed ? flipsFor(p) : flipsFor(p) + 0.5, result: r, apex: 1.7 + p * 1.1 };
    state = "fly";
    tone([330, 520], "triangle", 0.06);
  }

  function landed(now) {
    const r = fly.result;
    const c = course[hop];
    popup = { text: GRADES[r.grade].label, color: GRADES[r.grade].color, t0: now, at: fly.end };
    if (!r.landed) {
      state = "miss";
      boop();
      say(GRADES[r.grade].line);
      setTimeout(() => { fly = null; state = "ready"; hint.hidden = false; }, 1400);
      return;
    }
    points += r.points;
    squash = 1;
    if (c.mouth) {
      state = "eaten";
      chomp = now;
      tone([220, 180, 260], "triangle", 0.09);
      setTimeout(finish, 900);
      return;
    }
    state = "land";
    tone({ perfect: [660, 880, 1320], great: [660, 880], good: [660] }[r.grade], "sine", 0.08);
    say(GRADES[r.grade].line);
    setTimeout(() => {
      hop += 1;
      fly = null;
      drawHud();
      camFrom = cam; camTo = camFor(hop); camT = 0;
      state = "ready";
    }, 750);
  }

  function finish() {
    hop = PANS;
    drawHud();
    const best = Math.max(points, store.get("pancakeBest", 0));
    store.set("pancakeBest", best);
    celebrate(`Yum! ${snack.letter} is for ${snack.word}! ${points} points!`, scoreEl, points === MAX_POINTS);
    done.replaceChildren(h("div", { class: "card pk-done" },
      h("div", { class: "prompt" }, `😋 Yum! ${points} of ${MAX_POINTS} points`),
      h("div", { class: "sub" }, `${snack.letter} is for ${snack.word} · Best: ${best}`),
      h("button", { class: "next", onclick: play }, "Flip again 🥞")));
    requestAnimationFrame(() => done.scrollIntoView({ behavior: "smooth", block: "end" }));
  }

  // ---- drawing ----
  function drawRoom() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#1b2236");
    g.addColorStop(1, "#2c2440");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const near = cam.z + 0.6, far = cam.z + 60;
    const quad = [[-9, near], [9, near], [9, far], [-9, far]].map(([x, z]) => project(x, 0, z));
    if (quad.every(Boolean)) {
      ctx.fillStyle = "#4a3426";
      ctx.beginPath();
      quad.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(0,0,0,.18)";
    ctx.lineWidth = 1;
    for (let z = Math.ceil(near / 1.5) * 1.5; z < far; z += 1.5) {
      const a = project(-9, 0, z), b = project(9, 0, z);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawPan(i, now) {
    const p = panPos(i);
    const isTarget = state !== "eaten" && i === hop + 1 && !course[hop]?.mouth;
    const side = p.x < 0 ? -1 : 1;
    const a = project(p.x + side * PAN_R, 0.3, p.z), b = project(p.x + side * (PAN_R + 1.3), 0.38, p.z);
    if (a && b) {
      ctx.strokeStyle = "#5b3a22";
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(3, (F * 0.18) / a.d);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (circlePath(p.x, 0.01, p.z, PAN_R * 1.15)) {
      ctx.fillStyle = `rgba(255,120,40,${0.25 + 0.1 * Math.sin(now / 200 + i)})`;
      ctx.fill();
    }
    if (circlePath(p.x, 0, p.z, PAN_R)) { ctx.fillStyle = "#2a2d35"; ctx.fill(); }
    if (circlePath(p.x, 0.3, p.z, PAN_R)) {
      ctx.fillStyle = "#3b404b"; ctx.fill();
      ctx.strokeStyle = isTarget ? `rgba(255,210,63,${0.6 + 0.4 * Math.sin(now / 160)})` : "#646b7a";
      ctx.lineWidth = isTarget ? 4 : 2;
      ctx.stroke();
    }
    if (circlePath(p.x, 0.3, p.z, PAN_R * 0.82)) { ctx.fillStyle = "#1e2026"; ctx.fill(); }
  }

  function drawMouth(now) {
    const m = mouthPos();
    const c = project(m.x, m.y + 0.35, m.z);
    if (!c) return;
    const r = (F * 1.35) / c.d;
    const t = chomp ? Math.min(1, (now - chomp) / 900) : 0;
    const open = chomp ? Math.abs(Math.cos(t * Math.PI * 3)) * (1 - t) : 0.75 + 0.15 * Math.sin(now / 300);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.fillStyle = "#f2c49b";
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3b2a20";
    ctx.beginPath(); ctx.arc(0, 0, r * 1.03, Math.PI * 1.08, Math.PI * 1.92); ctx.quadraticCurveTo(0, -r * 0.45, -r * 0.88, -r * 0.5); ctx.fill();
    ctx.fillStyle = "#222";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      if (chomp && t < 1) ctx.ellipse(s * r * 0.36, -r * 0.18, r * 0.12, r * 0.04, 0, 0, Math.PI * 2);
      else ctx.ellipse(s * r * 0.36, -r * 0.18, r * 0.09, r * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,110,130,.45)";
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * r * 0.6, r * 0.12, r * 0.15, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = "#5a1a24";
    ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 0.34, Math.max(r * 0.04, r * 0.3 * open), 0, 0, Math.PI * 2); ctx.fill();
    if (open > 0.3) {
      ctx.fillStyle = "#e86a7d";
      ctx.beginPath(); ctx.ellipse(0, r * 0.42 + r * 0.18 * open, r * 0.2, r * 0.1 * open, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPancake(pos, theta, now) {
    const R = 0.78;
    const sq = 1 - 0.35 * squash;
    const n = { x: 0, y: Math.cos(theta), z: Math.sin(theta) };
    const pt = (lx, lz, lift) => project(
      pos.x + lx * R,
      pos.y + (-lz * Math.sin(theta) * R) * sq + n.y * lift,
      pos.z + lz * Math.cos(theta) * R + n.z * lift,
    );
    const face = (lift, fill) => {
      ctx.beginPath();
      for (let k = 0; k <= 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        const p = pt(Math.cos(a), Math.sin(a), lift);
        if (!p) return;
        k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
      }
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const toCam = { x: cam.x - pos.x, y: cam.y - pos.y, z: cam.z - pos.z };
    const topUp = n.y * toCam.y + n.z * toCam.z > 0;
    const th = 0.09;
    if (topUp) {
      face(-th, "#a8692b"); face(0, "#c98a3a"); face(th, "#efb860");
      const c = pt(0, 0, th), u = pt(1, 0, th), v = pt(0, -1, th);
      if (!c || !u || !v) return;
      ctx.save();
      const dpr = canvas.width / W;
      ctx.setTransform(dpr * (u.x - c.x) / 50, dpr * (u.y - c.y) / 50, dpr * (v.x - c.x) / 50, dpr * (v.y - c.y) / 50, dpr * c.x, dpr * c.y);
      ctx.fillStyle = "#6b3410";
      ctx.font = "900 58px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(snack.letter, 0, 4);
      ctx.restore();
    } else {
      face(th, "#efb860"); face(0, "#c98a3a"); face(-th, "#d99a48");
    }
    if (state === "hold" || state === "ready") {
      const s = project(pos.x, pos.y + 0.6 + ((now / 900) % 1) * 0.8, pos.z);
      if (s) {
        ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - ((now / 900) % 1))})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, (F * 0.12) / s.d, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function pancakePose(now) {
    if (!fly) {
      const p = panPos(hop);
      const tilt = state === "hold" ? -0.25 * power : 0;
      return { pos: { ...p, y: 0.22 + (state === "hold" ? 0.05 * Math.sin(now / 60) * power : 0) }, theta: tilt };
    }
    const t = Math.min(1, (now - fly.t0) / fly.dur);
    if (t >= 1 && state === "fly") landed(now);
    const e = ease(t);
    const pos = {
      x: lerp(fly.from.x, fly.end.x, t),
      y: lerp(fly.from.y, fly.end.y, t) + fly.apex * 4 * t * (1 - t),
      z: lerp(fly.from.z, fly.end.z, t),
    };
    return { pos, theta: -fly.flips * Math.PI * 2 * e };
  }

  function drawMeter() {
    const c = course[hop];
    if (!c || state === "eaten") return;
    const x = 16, w = 22, top = H * 0.12, bot = H * 0.82, len = bot - top;
    const yOf = (v) => bot - v * len;
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.beginPath(); ctx.roundRect(x - 4, top - 4, w + 8, len + 8, 12); ctx.fill();
    for (const [width, color] of [[0.18, "#3fa9f5"], [0.1, "#36c275"], [0.05, "#ffd23f"]]) {
      const half = width * c.scale;
      ctx.fillStyle = color;
      const y1 = yOf(Math.min(1, c.target + half)), y2 = yOf(Math.max(0, c.target - half));
      ctx.fillRect(x, y1, w, y2 - y1);
    }
    const y = yOf(state === "ready" ? 0 : power);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 6, y - 3, w + 12, 6);
    ctx.beginPath(); ctx.moveTo(x + w + 8, y); ctx.lineTo(x + w + 18, y - 8); ctx.lineTo(x + w + 18, y + 8); ctx.fill();
  }

  function drawPopup(now) {
    if (!popup) return;
    const t = (now - popup.t0) / 1200;
    if (t > 1) { popup = null; return; }
    const p = project(popup.at.x, popup.at.y + 1.2 + t * 1.2, popup.at.z);
    if (!p) return;
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.font = `900 ${Math.round(30 + 8 * Math.sin(Math.min(1, t * 4) * Math.PI))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.strokeText(popup.text, Math.min(W - 80, Math.max(80, p.x)), p.y);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, Math.min(W - 80, Math.max(80, p.x)), p.y);
    ctx.restore();
  }

  function frame(now) {
    if (!canvas.isConnected) { hum(false); removeEventListener("resize", size); return; }
    if (state === "hold") {
      power = meter(now - holdStart);
      if (osc) osc.o.frequency.value = 200 + power * 500;
    }
    if (camT < 1) {
      camT = Math.min(1, camT + 1 / 40);
      const k = ease(camT);
      cam = { x: lerp(camFrom.x, camTo.x, k), y: lerp(camFrom.y, camTo.y, k), z: lerp(camFrom.z, camTo.z, k) };
    }
    squash = Math.max(0, squash - 0.06);
    drawRoom();
    const pose = state === "eaten" ? null : pancakePose(now);
    const items = [];
    for (let i = 0; i < PANS; i++) items.push({ z: panPos(i).z + PAN_R, draw: () => drawPan(i, now) });
    items.push({ z: mouthPos().z, draw: () => drawMouth(now) });
    if (pose) items.push({ z: pose.pos.z, draw: () => drawPancake(pose.pos, pose.theta, now) });
    items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
    drawMeter();
    drawPopup(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
