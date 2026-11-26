import {
  meter, makeCourse, pancakeSnack, planFlight, flightPoint, arcPoints, panPos, mouthPos,
  GRADES, PANS, MAX_POINTS, PAN_R, REST_Y,
} from "./pancake-logic.js";

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
const PITCH = 0.42;
const TAU = Math.PI * 2;
const COUNTER_W = 4.6;
const ARC_DOTS = 24;

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

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = canvas.getContext("2d");
  const bg = document.createElement("canvas");
  let W = 0, H = 0, F = 0, horizon = 0, scene = 0, eyeY = 0;
  // Capped at 2x: 3x phones would triple the fill cost for no visible gain.
  // The play area keeps its old size anchored to the bottom; spare screen height above it shows the kitchen.
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    scene = Math.round(Math.min(innerHeight * 0.6, W * 1.35));
    const room = innerHeight - canvas.getBoundingClientRect().top - scrollY - 16;
    H = Math.round(Math.max(scene, Math.min(room, W * 1.7)));
    eyeY = H - scene * 0.58;
    canvas.style.height = `${H}px`;
    canvas.width = bg.width = Math.round(W * dpr);
    canvas.height = bg.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = W * 1.05;
    horizon = eyeY - F * Math.tan(PITCH);
    paintBackdrop(bg.getContext("2d"), dpr);
  };

  // ---- state ----
  let state = "ready"; // ready | hold | fly | land | miss | eaten
  let holdStart = 0;
  let power = 0;
  let fly = null;
  let settle = null;
  let popup = null;
  let touchdown = -1e9;
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
    return { x: W / 2 + (F * dx) / z2, y: eyeY - (F * y2) / z2, d: z2 };
  }

  size();
  addEventListener("resize", size);

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

  // Soft radial blob lying flat at height y: shadows and glows without shadowBlur (slow on phones).
  function blob(x, y, z, r, rgb, alpha) {
    const c = project(x, y, z), f = project(x, y, z + r);
    if (!c || !f || alpha <= 0) return;
    const rx = (F * r) / c.d, ry = Math.max(1, Math.abs(c.y - f.y));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }

  const sideSheen = (x, y, z, r, stops) => {
    const c = project(x, y, z);
    if (!c) return stops[1];
    const rx = (F * r) / c.d;
    const g = ctx.createLinearGradient(c.x - rx, 0, c.x + rx, 0);
    stops.forEach((col, k) => g.addColorStop(k / (stops.length - 1), col));
    return g;
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
    fly = { ...planFlight(course, hop, p), t0: performance.now() };
    state = "fly";
    tone([330, 520], "triangle", 0.06);
  }

  function landed(now) {
    const r = fly.result;
    const c = course[hop];
    popup = { text: GRADES[r.grade].label, color: GRADES[r.grade].color, t0: now, at: fly.end };
    touchdown = now;
    if (!r.landed) {
      state = "miss";
      boop();
      say(GRADES[r.grade].line);
      setTimeout(() => { fly = null; state = "ready"; hint.hidden = false; }, 1400);
      return;
    }
    points += r.points;
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
      settle = { from: fly.end, t0: performance.now() };
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
  // Screen-space kitchen behind the counter; repainted only on resize.
  function paintBackdrop(b, dpr) {
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wall = b.createLinearGradient(0, 0, 0, horizon);
    wall.addColorStop(0, "#241c3a");
    wall.addColorStop(1, "#3a2a4c");
    b.fillStyle = wall;
    b.fillRect(0, 0, W, horizon + 1);
    const top = 10, bottom = horizon - 10;
    if (bottom - top > 16) {
      const wx = W * 0.14, ww = W * 0.72;
      const sky = b.createLinearGradient(0, top, 0, bottom);
      sky.addColorStop(0, "#4f5f9e");
      sky.addColorStop(0.6, "#b986ad");
      sky.addColorStop(1, "#f4b98a");
      b.fillStyle = sky;
      b.beginPath(); b.roundRect(wx, top, ww, bottom - top, 8); b.fill();
      const sun = b.createRadialGradient(wx + ww * 0.7, bottom, 0, wx + ww * 0.7, bottom, ww * 0.35);
      sun.addColorStop(0, "rgba(255,226,160,.9)");
      sun.addColorStop(1, "rgba(255,226,160,0)");
      b.save();
      b.clip();
      b.fillStyle = sun;
      b.fillRect(wx, top, ww, bottom - top);
      b.restore();
      b.strokeStyle = "#1a1428";
      b.lineWidth = 4;
      b.beginPath(); b.roundRect(wx, top, ww, bottom - top, 8); b.stroke();
      b.lineWidth = 3;
      b.beginPath();
      for (const f of [1 / 3, 2 / 3]) { b.moveTo(wx + ww * f, top); b.lineTo(wx + ww * f, bottom); }
      b.stroke();
    }
    const floor = b.createLinearGradient(0, horizon, 0, H);
    floor.addColorStop(0, "#1f1830");
    floor.addColorStop(1, "#0e0b16");
    b.fillStyle = floor;
    b.fillRect(0, horizon, W, H - horizon);
  }

  function drawRoom() {
    ctx.drawImage(bg, 0, 0, W, H);
    const near = cam.z + 0.6, far = cam.z + 70;
    const at = (x, y, z) => project(x, y, z);
    const top = [at(-COUNTER_W, 0, near), at(COUNTER_W, 0, near), at(COUNTER_W, 0, far), at(-COUNTER_W, 0, far)];
    if (!top.every(Boolean)) return;
    const poly = (pts) => { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); };
    ctx.fillStyle = "#24170f";
    for (const s of [-1, 1]) {
      const side = [at(s * COUNTER_W, 0, near), at(s * COUNTER_W, 0, far), at(s * COUNTER_W, -0.8, far), at(s * COUNTER_W, -0.8, near)];
      if (side.every(Boolean)) { poly(side); ctx.fill(); }
    }
    const wood = ctx.createLinearGradient(0, top[0].y, 0, top[2].y);
    wood.addColorStop(0, "#80553a");
    wood.addColorStop(0.5, "#5d3d2a");
    wood.addColorStop(1, "#2f2236");
    ctx.fillStyle = wood;
    poly(top); ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(30,15,8,.22)";
    ctx.beginPath();
    for (let x = -COUNTER_W + 0.92; x < COUNTER_W; x += 0.92) {
      const a = at(x, 0, near), b = at(x, 0, far);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    for (let z = Math.ceil(near / 3) * 3; z < far; z += 3) {
      const a = at(-COUNTER_W, 0, z), b = at(COUNTER_W, 0, z);
      ctx.strokeStyle = `rgba(30,15,8,${0.25 * Math.min(1, 10 / a.d)})`;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,210,160,.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y); ctx.lineTo(top[3].x, top[3].y);
    ctx.moveTo(top[1].x, top[1].y); ctx.lineTo(top[2].x, top[2].y);
    ctx.stroke();
  }

  function drawPan(i, now) {
    const p = panPos(i);
    const isTarget = state !== "eaten" && state !== "hold" && i === hop + 1 && !course[hop]?.mouth;
    const side = p.x < 0 ? -1 : 1;
    blob(p.x, 0.005, p.z, PAN_R * 1.7, "255,130,50", reduced ? 0.3 : 0.27 + 0.06 * Math.sin(now / 260 + i));
    blob(p.x + 0.2 * side, 0.01, p.z - 0.15, PAN_R * 1.3, "8,4,12", 0.55);
    const a = project(p.x + side * PAN_R, 0.3, p.z), b = project(p.x + side * (PAN_R + 1.3), 0.38, p.z);
    if (a && b) {
      const wide = Math.max(3, (F * 0.18) / a.d);
      ctx.lineCap = "round";
      ctx.strokeStyle = "#4a2e1b";
      ctx.lineWidth = wide;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = "rgba(255,200,150,.25)";
      ctx.lineWidth = wide * 0.3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y - wide * 0.2); ctx.lineTo(b.x, b.y - wide * 0.2); ctx.stroke();
    }
    if (circlePath(p.x, 0, p.z, PAN_R)) {
      ctx.fillStyle = sideSheen(p.x, 0, p.z, PAN_R, ["#15171c", "#4b515e", "#2a2d35", "#121318"]);
      ctx.fill();
    }
    if (circlePath(p.x, 0.3, p.z, PAN_R)) {
      ctx.fillStyle = sideSheen(p.x, 0.3, p.z, PAN_R, ["#3a3f4a", "#707888", "#454a56", "#2c3038"]);
      ctx.fill();
      const glow = reduced ? 1 : 0.6 + 0.4 * Math.sin(now / 160);
      ctx.strokeStyle = isTarget ? `rgba(255,210,63,${glow})` : "rgba(170,180,200,.45)";
      ctx.lineWidth = isTarget ? 4 : 1.5;
      ctx.stroke();
    }
    if (circlePath(p.x, 0.3, p.z, PAN_R * 0.84)) {
      const c = project(p.x - 0.3, 0.3, p.z + 0.3);
      const r = c ? (F * PAN_R) / c.d : 1;
      const g = c ? ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r) : "#1e2026";
      if (c) { g.addColorStop(0, "#3d424d"); g.addColorStop(1, "#15171b"); }
      ctx.fillStyle = g;
      ctx.fill();
    }
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
    const skin = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    skin.addColorStop(0, "#ffdcb8");
    skin.addColorStop(1, "#e2a77e");
    ctx.fillStyle = skin;
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

  const groundUnder = (pos) => {
    for (let i = 0; i < PANS; i++) {
      const p = panPos(i);
      if (Math.hypot(pos.x - p.x, pos.z - p.z) < PAN_R) return 0.3;
    }
    return 0;
  };

  // s > 0 squashes (wider, thinner), s < 0 stretches.
  function drawPancake(pos, theta, s) {
    const ground = groundUnder(pos);
    const up = Math.max(0, pos.y - ground);
    blob(pos.x, ground + 0.005, pos.z, 0.85 * (1 + 0.45 * up), "8,4,12", 0.5 / (1 + 0.9 * up));
    const R = 0.78 * (1 + 0.16 * s);
    const n = { x: 0, y: Math.cos(theta), z: Math.sin(theta) };
    const pt = (lx, lz, lift) => project(
      pos.x + lx * R,
      pos.y - lz * Math.sin(theta) * R + n.y * lift,
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
    const golden = (lift, inner, outer) => {
      const c = pt(0, 0, lift), u = pt(1, 0, lift);
      if (!c || !u) return outer;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.hypot(u.x - c.x, u.y - c.y) * 1.1);
      g.addColorStop(0, inner);
      g.addColorStop(0.65, inner);
      g.addColorStop(1, outer);
      return g;
    };
    const toCam = { x: cam.x - pos.x, y: cam.y - pos.y, z: cam.z - pos.z };
    const topUp = n.y * toCam.y + n.z * toCam.z > 0;
    const th = 0.09 * (1 - 0.55 * s);
    if (topUp) {
      face(-th, "#8f5524"); face(0, "#b8762f"); face(th, golden(th, "#f7cd78", "#d38f3e"));
      const c = pt(0, 0, th), u = pt(1, 0, th), v = pt(0, -1, th);
      if (!c || !u || !v) return;
      const shine = pt(-0.4, 0.4, th);
      if (shine) {
        const r = Math.hypot(u.x - c.x, u.y - c.y) * 0.35;
        const g = ctx.createRadialGradient(shine.x, shine.y, 0, shine.x, shine.y, r);
        g.addColorStop(0, "rgba(255,248,220,.4)");
        g.addColorStop(1, "rgba(255,248,220,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(shine.x, shine.y, r, 0, TAU); ctx.fill();
      }
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
      face(th, "#e9b061"); face(0, "#b8762f"); face(-th, golden(-th, "#e3a453", "#b06c2c"));
    }
  }

  function drawArc(now) {
    if (state !== "hold") return;
    const plan = planFlight(course, hop, power);
    const perfect = plan.result.grade === "perfect";
    const { end } = plan;
    const pulse = reduced ? 0 : 0.06 * Math.sin(now / 140);
    ctx.fillStyle = "rgba(255,255,255,.22)";
    for (const p of arcPoints(plan, ARC_DOTS, (x, _y, z) => project(x, groundUnder({ x, z }) + 0.01, z))) {
      if (p.t < 0.08 || p.t > 0.96) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, (F * 0.03) / p.d), 0, TAU); ctx.fill();
    }
    if (circlePath(end.x, end.y + 0.02, end.z, 0.6 + pulse)) {
      ctx.fillStyle = perfect ? "rgba(255,210,63,.32)" : "rgba(255,255,255,.12)";
      ctx.fill();
      ctx.strokeStyle = perfect ? "#ffd23f" : "rgba(255,255,255,.6)";
      ctx.lineWidth = perfect ? 3.5 : 2;
      ctx.stroke();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(20,10,30,.45)";
    ctx.fillStyle = perfect ? "#ffe58a" : "#fff";
    arcPoints(plan, ARC_DOTS, project).forEach((p, k) => {
      if (p.t < 0.08 || p.t > 0.96) return;
      ctx.globalAlpha = Math.min(1, 8 / p.d) * (reduced ? 0.9 : 0.72 + 0.28 * Math.sin(now / 110 - k * 0.9));
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, (F * 0.06) / p.d), 0, TAU); ctx.fill(); ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  const squashAt = (now) => {
    const dt = now - touchdown;
    return dt > 700 ? 0 : (reduced ? 0.5 : 1) * Math.exp(-dt / 150) * Math.cos(dt / 50);
  };

  function pancakePose(now) {
    if (!fly) {
      const p = panPos(hop);
      let pos = { ...p, y: REST_Y };
      if (settle) {
        const k = ease(Math.min(1, (now - settle.t0) / 450));
        pos = { x: lerp(settle.from.x, p.x, k), y: lerp(settle.from.y, REST_Y, k), z: lerp(settle.from.z, p.z, k) };
        if (k >= 1) settle = null;
      }
      if (state !== "hold") return { pos, theta: 0, s: squashAt(now) };
      if (!reduced) pos.y += 0.04 * Math.sin(now / 60) * power;
      return { pos, theta: -0.25 * power, s: 0.3 * power };
    }
    const t = Math.min(1, (now - fly.t0) / fly.dur);
    if (t >= 1 && state === "fly") landed(now);
    return { pos: flightPoint(fly, t), theta: -fly.flips * TAU * ease(t), s: t < 1 ? -0.35 * (1 - t) ** 3 : squashAt(now) };
  }

  function drawMeter() {
    const c = course[hop];
    if (!c || state === "eaten") return;
    const x = 16, w = 22, top = H - scene * 0.88, bot = H - scene * 0.18, len = bot - top;
    const yOf = (v) => bot - v * len;
    ctx.fillStyle = "rgba(10,6,18,.55)";
    ctx.beginPath(); ctx.roundRect(x - 4, top - 4, w + 8, len + 8, 14); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x, top, w, len, 10); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.07)";
    ctx.fillRect(x, top, w, len);
    for (const [width, color] of [[0.18, "#3fa9f5"], [0.1, "#36c275"], [0.05, "#ffd23f"]]) {
      const half = width * c.scale;
      ctx.fillStyle = color;
      const y1 = yOf(Math.min(1, c.target + half)), y2 = yOf(Math.max(0, c.target - half));
      ctx.fillRect(x, y1, w, y2 - y1);
    }
    const sheen = ctx.createLinearGradient(x, 0, x + w, 0);
    sheen.addColorStop(0, "rgba(255,255,255,.25)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(0,0,0,.2)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x, top, w, len);
    ctx.restore();
    const y = yOf(state === "ready" ? 0 : power);
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.roundRect(x - 6, y - 3, w + 12, 6, 3); ctx.fill();
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
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    ctx.strokeText(popup.text, Math.min(W - 80, Math.max(80, p.x)), p.y);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, Math.min(W - 80, Math.max(80, p.x)), p.y);
    ctx.restore();
  }

  // Everything animates off elapsed time, so 60 Hz and 120 Hz phones play at the same speed.
  let last = performance.now();
  function frame(now) {
    if (!canvas.isConnected) { hum(false); removeEventListener("resize", size); return; }
    const dt = Math.min(50, now - last);
    last = now;
    if (state === "hold") {
      power = meter(now - holdStart);
      if (osc) osc.o.frequency.value = 200 + power * 500;
    }
    if (camT < 1) {
      camT = Math.min(1, camT + dt / 650);
      const k = ease(camT);
      cam = { x: lerp(camFrom.x, camTo.x, k), y: lerp(camFrom.y, camTo.y, k), z: lerp(camFrom.z, camTo.z, k) };
    }
    drawRoom();
    const pose = state === "eaten" ? null : pancakePose(now);
    const items = [];
    for (let i = 0; i < PANS; i++) items.push({ z: panPos(i).z + PAN_R, draw: () => drawPan(i, now) });
    items.push({ z: mouthPos().z, draw: () => drawMouth(now) });
    if (pose) items.push({ z: pose.pos.z, draw: () => drawPancake(pose.pos, pose.theta, pose.s) });
    items.sort((a, b) => b.z - a.z).forEach((it) => it.draw());
    drawArc(now);
    drawMeter();
    drawPopup(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
