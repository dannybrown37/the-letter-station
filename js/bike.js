import { WORDS } from "./data.js";
import { firstLetter, shuffle } from "./logic.js";
import {
  makeTrack, makeRow, judgeGate, steerToward, bikeLine, bikeLetter, bikeSnack, rideSpeed, rowZ, laneStep, FINISH_GAP,
  zoneMix, propZone, featureAt, blendPalette, mixColor, GATE_HALF, TARGETS,
} from "./bike-logic.js";

const CSS = `
.bk-hud { display: flex; align-items: center; gap: 10px; text-align: left; }
.bk-hud .bk-text { flex: 1; min-width: 0; }
.bk-hud .prompt { margin: 0; }
.bk-dots { display: flex; gap: 6px; margin-top: 4px; }
.bk-dots i { width: 14px; height: 14px; border-radius: 50%; background: var(--line); }
.bk-dots i.done { background: #36c275; }
.bk-score { flex: 0 0 auto; font-size: 1.5rem; font-weight: 900; }
.bk-stage { position: relative; margin-top: 10px; border-radius: 20px; overflow: hidden; }
.bk-stage canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.bk-hint { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font-weight: 900; font-size: 1.15rem;
  pointer-events: none; text-shadow: 0 2px 4px #000; animation: bk-pulse 1.4s ease-in-out infinite; }
@keyframes bk-pulse { 50% { transform: scale(1.08); } }
.bk-done { display: grid; gap: 10px; margin-top: 12px; text-align: center; }
.bk-done .prompt { font-size: 1.5rem; }
.bk-done .bk-buttons { display: grid; gap: 10px; }
`;

const TITLE = "Bike Ride 🚲";
const TABS = [[false, "ABC"], [true, "abc"]];
const RW = 2;
const CAM_H = 2.2;
const AHEAD = 3.4;
const CAM_FOLLOW = 0.55;
const DRAW = 170;
const SLOPE = 0.12;
const RAINBOW = ["#ff6b6b", "#ffb347", "#ffe066", "#7be07b", "#5ec8ff", "#b48cff"];
const FLAG_COLORS = ["#e94b6a", "#3fa9f5", "#8f6bff", "#ff8a3d", "#00a99b", "#d6408f", "#2fb36a"];

let ui;
let lower = false;
let letter = null;

function addStyle() {
  if (document.getElementById("bike-css")) return;
  document.head.append(Object.assign(document.createElement("style"), { id: "bike-css", textContent: CSS }));
}

export function bike(kit) {
  ui = kit;
  addStyle();
  letter ??= bikeLetter();
  play();
}

const hash = (i) => {
  let x = (i * 374761393) ^ 0x5bd1e995;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const roadY = (z) => -SLOPE * z + 3 * Math.sin(z / 60) + 1.5 * Math.sin(z / 23);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const laneName = (x) => (x < 0 ? "left" : x > 0 ? "right" : "middle");

function signWords(l) {
  const mine = [...WORDS.stores, ...WORDS.restaurants].filter((w) => firstLetter(w) === l);
  return mine.length ? mine : WORDS.stores;
}

function play() {
  const { h, screen, say, speak, celebrate, tone, boop, store } = ui;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const show = (l) => (lower ? l.toLowerCase() : l);
  const track = makeTrack();
  const curveAt = (i) => track[((i % track.length) + track.length) % track.length];
  const snack = bikeSnack(letter);
  const signs = signWords(letter);
  const prompt = `Ride through the ${letter} flags!`;
  const promptEl = h("div", { class: "prompt" });
  // Case is display only, so switching tabs mid-ride keeps the run.
  const tabs = h("div", { class: "tabs" });
  const drawTabs = () => {
    promptEl.textContent = `Ride through the ${show(letter)} flags!`;
    tabs.replaceChildren(...TABS.map(([k, lbl]) =>
      h("button", { class: lower === k ? "on" : "", onclick: () => { lower = k; drawTabs(); } }, lbl)));
  };
  drawTabs();

  const canvas = h("canvas", { "aria-label": "Bike ride. Touch left or right to steer." });
  const hint = h("div", { class: "bk-hint" }, "👆 Tap to ride! Steer with your finger");
  const scoreEl = h("div", { class: "bk-score" }, "🚩 0");
  const dots = h("div", { class: "bk-dots" });
  const done = h("div");
  const drawHud = () => {
    scoreEl.textContent = `🚩 ${caught}`;
    dots.replaceChildren(...Array.from({ length: TARGETS }, (_, i) => h("i", { class: i < caught ? "done" : "" })));
  };

  screen(TITLE,
    tabs,
    h("div", { class: "card compact" },
      h("div", { class: "bk-hud" },
        h("div", { class: "bk-text" }, promptEl, dots),
        scoreEl,
        h("button", { class: "say round", "aria-label": "Hear it", onclick: () => speak(`${prompt} Touch left or right to steer.`) }, "🔊"))),
    h("div", { class: "bk-stage" }, canvas, hint),
    done);
  say(`${prompt} Tap to go.`);

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, F = 0, HZ = 0;
  let looping = true;
  const size = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = Math.round(Math.min(innerHeight * 0.6, W * 1.35));
    canvas.style.height = `${H}px`;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = W * 0.8;
    HZ = H * 0.34;
    if (!looping) { looping = true; last = performance.now(); requestAnimationFrame(frame); }
  };
  size();
  addEventListener("resize", size);
  const onHide = () => hum(!document.hidden && state === "ride");
  document.addEventListener("visibilitychange", onHide);

  let state = "ready";
  let camZ = 0, v = 0, x = 0, targetX = 0, lean = 0, pedal = 0, bgX = 0;
  let wobble = 0, shake = 0;
  let caught = 0, firstTry = 0, slotMissed = false;
  let rowIndex = 0, prevX = null, finishZ = null;
  const rows = [];
  let sparks = [];
  let popup = null;
  let osc = null;
  let last = performance.now();
  drawHud();

  function hum(on) {
    try {
      if (on && !osc) {
        const a = ui.audio();
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = "sine";
        o.frequency.value = 90;
        g.gain.value = 0.035;
        o.connect(g).connect(a.destination);
        o.start();
        osc = { o, g };
      } else if (!on && osc) {
        const t = ui.audio().currentTime;
        osc.g.gain.setTargetAtTime(0, t, 0.05);
        osc.o.stop(t + 0.3);
        osc = null;
      }
    } catch { osc = null; }
  }

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  let pressed = false;
  let downX = 0, dragging = false;
  const frac = (e) => {
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
  };
  canvas.addEventListener("pointerdown", (e) => {
    if (state === "done") return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    pressed = true;
    dragging = false;
    downX = e.clientX;
    if (state === "ride") targetX = laneStep(targetX, frac(e) < 0.5 ? -1 : 1);
    if (state === "ready") {
      state = "ride";
      hint.hidden = true;
      hum(true);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pressed || state === "done") return;
    dragging ||= Math.abs(e.clientX - downX) > 12;
    if (dragging) targetX = underFinger(frac(e));
  });
  const up = () => { pressed = false; };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  function spawnRows() {
    while (finishZ === null && rowZ(rowIndex) < camZ + DRAW + 20) {
      const row = makeRow(letter, prevX, rowIndex);
      prevX = row.gates.find((g) => g.target).x;
      // Colors are shuffled per row so the target's color never gives the letter away.
      const colors = shuffle(FLAG_COLORS);
      row.gates.forEach((g, k) => { g.color = colors[k]; });
      rows.push({ ...row, z: rowZ(rowIndex), index: rowIndex, judged: false, glow: false });
      rowIndex += 1;
    }
  }

  function judge(row, now) {
    row.judged = true;
    const r = judgeGate(row, x);
    const line = bikeLine(r.kind, letter, row, x, r.gate);
    if (r.kind === "right") {
      caught += 1;
      if (!slotMissed) firstTry += 1;
      slotMissed = false;
      r.gate.caught = now;
      tone([784, 1047, 1319], "sine", 0.07);
      for (let k = 0; k < (reduced ? 10 : 18); k++) {
        const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 160;
        sparks.push({ x: W / 2 + (x * W) / 4, y: H * 0.55, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, t0: now, hue: k % 3 });
      }
      popup = { text: `${show(letter)}! ⭐`, color: "#ffd23f", t0: now };
      drawHud();
      if (caught >= TARGETS) {
        rows.splice(rows.indexOf(row) + 1);
        finishZ = row.z + FINISH_GAP;
      } else say(line);
      return;
    }
    slotMissed = true;
    const next = rows.find((o) => !o.judged);
    if (next) next.glow = true;
    if (r.kind === "wrong") {
      r.gate.bumped = now;
      wobble = 1;
      shake = reduced ? 0 : 1;
      boop();
      popup = { text: `That was ${show(r.gate.letter)}`, color: "#c9b8ff", t0: now };
    } else {
      wobble = 0.5;
      tone([392, 330], "sine", 0.12);
      popup = { text: `Find ${show(letter)}!`, color: "#c9b8ff", t0: now };
    }
    say(line);
  }

  function finish() {
    state = "done";
    hum(false);
    const best = Math.max(firstTry, store.get("bikeBest", 0));
    store.set("bikeBest", best);
    celebrate(`${letter} is for ${snack}! You got all the ${letter} flags!`, scoreEl);
    done.replaceChildren(h("div", { class: "card bk-done" },
      h("div", { class: "prompt" }, `🏁 ${show(letter)} is for ${snack}!`),
      h("div", { class: "sub" }, `${firstTry} of ${TARGETS} on the first try · Best: ${best}`),
      h("div", { class: "bk-buttons" },
        h("button", { class: "next", onclick: play }, "Ride again 🚲"),
        h("button", { class: "next", onclick: () => { letter = bikeLetter(Math.random, letter); play(); } }, "New letter 🔤"))));
    requestAnimationFrame(() => done.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "end" }));
  }

  const palettes = new Map();
  const paletteAt = (i) => {
    if (!palettes.has(i)) palettes.set(i, blendPalette(zoneMix(i)));
    return palettes.get(i);
  };

  const xs = new Float64Array(DRAW + 2);
  let base = 0, camX = 0, camY = 0;

  function offsets() {
    base = Math.floor(camZ);
    const frac = camZ - base;
    let off = 0, dx = -curveAt(base) * frac;
    for (let n = 0; n <= DRAW + 1; n++) {
      xs[n] = off;
      off += dx;
      dx += curveAt(base + n);
    }
  }

  const centerAt = (z) => {
    const f = z - base, n = Math.floor(f);
    if (n < 0 || n > DRAW) return 0;
    return xs[n] + (xs[n + 1] - xs[n]) * (f - n);
  };

  function project(wx, wy, z) {
    const dz = z - camZ;
    if (dz < 0.3) return null;
    const s = F / dz;
    return { x: W / 2 + (wx - camX) * s, y: HZ - (wy - camY) * s, s, dz };
  }
  // Inverts the bike's projection (the camera follows it part way) so the bike settles under the finger.
  const underFinger = (u) => ((u - 0.5) * W / (F / AHEAD) - centerAt(camZ + AHEAD)) / (RW * (1 - CAM_FOLLOW));
  const at = (rx, z, lift = 0) => project(centerAt(z) + rx, roadY(z) + lift, z);
  const fade = (dz) => clamp01((DRAW - dz) / 40);

  const STARS = Array.from({ length: 70 }, (_, i) => ({ x: hash(i * 7 + 1), y: hash(i * 7 + 2), r: 0.6 + hash(i * 7 + 3) * 1.4 }));

  function drawSky(pal, mix, now) {
    const g = ctx.createLinearGradient(0, 0, 0, HZ + 40);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.6, pal.skyMid);
    g.addColorStop(1, pal.skyLow);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (mix.town > 0.01) {
      ctx.globalAlpha = mix.town;
      ctx.fillStyle = "#ffcf7a";
      ctx.beginPath(); ctx.arc(W * 0.72, HZ - 6, W * 0.11, 0, Math.PI * 2); ctx.fill();
    }
    if (mix.nature > 0.01) {
      ctx.globalAlpha = mix.nature * 0.8;
      ctx.fillStyle = "#e9f6f2";
      for (let k = 0; k < 4; k++) {
        const cx = ((((k * 0.31 + 0.1) * W * 1.4 - bgX * 0.25) % (W * 1.4)) + W * 1.4) % (W * 1.4) - W * 0.2, cy = HZ * (0.25 + 0.15 * (k % 2));
        for (const [ox, r] of [[0, 18], [20, 14], [-18, 12]]) { ctx.beginPath(); ctx.arc(cx + ox, cy, r, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    if (mix.mystic > 0.01) {
      ctx.globalAlpha = mix.mystic;
      ctx.fillStyle = "#fff";
      for (const st of STARS) {
        const tw = reduced ? 1 : 0.6 + 0.4 * Math.sin(now / 500 + st.x * 40);
        ctx.globalAlpha = mix.mystic * tw;
        ctx.beginPath(); ctx.arc(((st.x * W * 1.2 - bgX * 0.05) % W + W) % W, st.y * HZ, st.r, 0, Math.PI * 2); ctx.fill();
      }
      for (const [k, color] of [[0, "#5affc8"], [1, "#ff7ae0"], [2, "#7ab8ff"]]) {
        ctx.globalAlpha = mix.mystic * 0.28;
        ctx.strokeStyle = color;
        ctx.lineWidth = 16 - k * 3;
        ctx.beginPath();
        for (let px = -10; px <= W + 10; px += 10) {
          const py = HZ * (0.18 + k * 0.1) + Math.sin(px / 60 + k * 2 + (reduced ? 0 : now / 1800)) * 14;
          px === -10 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = mix.mystic;
      ctx.fillStyle = "#f4f0ff";
      ctx.beginPath(); ctx.arc(W * 0.24, HZ * 0.3, 16, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawBackdrop(pal, mix);
  }

  function drawBackdrop(pal, mix) {
    const shift = (k) => ((-bgX * k) % W + W) % W;
    if (mix.town > 0.01) {
      ctx.globalAlpha = mix.town;
      ctx.fillStyle = pal.hillFar;
      for (let rep = -1; rep <= 1; rep++) {
        for (let k = 0; k < 12; k++) {
          const bw = W / 12, bh = 14 + hash(k + 50) * 34;
          ctx.fillRect(shift(0.3) + rep * W + k * bw, HZ - bh, bw - 2, bh + 4);
        }
      }
    }
    if (mix.nature > 0.01) {
      ctx.globalAlpha = mix.nature;
      for (let rep = -1; rep <= 1; rep++) {
        for (let k = 0; k < 5; k++) {
          const mx = shift(0.3) + rep * W + (k + 0.5) * (W / 5), mh = 40 + hash(k + 90) * 45, mw = 60 + hash(k + 91) * 30;
          ctx.fillStyle = pal.hillFar;
          ctx.beginPath(); ctx.moveTo(mx - mw, HZ + 2); ctx.lineTo(mx, HZ - mh); ctx.lineTo(mx + mw, HZ + 2); ctx.fill();
          ctx.fillStyle = "#e8f2f5";
          ctx.beginPath(); ctx.moveTo(mx - mw * 0.25, HZ - mh * 0.75); ctx.lineTo(mx, HZ - mh); ctx.lineTo(mx + mw * 0.25, HZ - mh * 0.75); ctx.fill();
        }
      }
    }
    if (mix.mystic > 0.01) {
      ctx.globalAlpha = mix.mystic;
      for (let rep = -1; rep <= 1; rep++) {
        for (let k = 0; k < 3; k++) {
          const ix = shift(0.2) + rep * W + (k + 0.5) * (W / 3), iy = HZ * (0.45 + 0.18 * hash(k + 7)), iw = 34 + hash(k + 8) * 20;
          ctx.fillStyle = pal.hillFar;
          ctx.beginPath(); ctx.moveTo(ix - iw, iy); ctx.lineTo(ix + iw, iy); ctx.lineTo(ix + iw * 0.2, iy + iw * 0.9); ctx.lineTo(ix - iw * 0.3, iy + iw * 0.6); ctx.fill();
          ctx.fillStyle = "#3d8a6a";
          ctx.fillRect(ix - iw, iy - 4, iw * 2, 5);
          ctx.fillStyle = "#7ff5e0";
          ctx.beginPath(); ctx.arc(ix + iw * 0.4, iy - 9, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.hillNear;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let px = 0; px <= W + 8; px += 8) ctx.lineTo(px, HZ + 4 - 14 * (0.5 + 0.5 * Math.sin((px + bgX * 0.6) / 70)));
    ctx.lineTo(W + 8, H);
    ctx.fill();
  }

  function quad(c, x1, y1, w1, x2, y2, w2) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1);
    ctx.fill();
  }

  function drawSegment(n) {
    const i = base + n;
    const pal = paletteAt(i);
    const p1 = project(xs[n], roadY(i), i), p2 = project(xs[n + 1], roadY(i + 1), i + 1);
    if (!p1 || !p2 || p1.y <= p2.y) return;
    const feat = featureAt(i);
    const stripe = Math.floor(i / 3) % 2;
    const fogT = clamp01(p1.dz / DRAW) ** 1.6;
    const fog = (c) => mixColor(c, pal.fog, fogT);
    const w1 = p1.s * RW, w2 = p2.s * RW;
    const ground = feat?.id === "bridge" ? (stripe ? "#2f7aa8" : "#2a6f9a")
      : feat?.id === "rainbow" ? "#140c33"
        : feat?.id === "cave" ? (stripe ? "#1a1433" : "#211a40")
          : stripe ? pal.grassA : pal.grassB;
    ctx.fillStyle = fog(ground);
    ctx.fillRect(0, p2.y, W, p1.y - p2.y + 1);
    const edge = feat?.id === "bridge" ? "#5b3a22" : feat?.id === "rainbow" ? "#f4f0ff" : stripe ? pal.rumbleA : pal.rumbleB;
    quad(fog(edge), p1.x, p1.y, w1 * 1.12, p2.x, p2.y, w2 * 1.12);
    if (feat?.id === "rainbow") {
      for (let k = 0; k < RAINBOW.length; k++) {
        const a = -1 + (2 * k) / RAINBOW.length, b = a + 2 / RAINBOW.length;
        ctx.fillStyle = fog(RAINBOW[k]);
        ctx.beginPath();
        ctx.moveTo(p1.x + a * w1, p1.y); ctx.lineTo(p2.x + a * w2, p2.y); ctx.lineTo(p2.x + b * w2, p2.y); ctx.lineTo(p1.x + b * w1, p1.y);
        ctx.fill();
      }
      return;
    }
    const road = feat?.id === "bridge" ? (stripe ? "#8a6a45" : "#7d5f3d") : stripe ? pal.roadA : pal.roadB;
    quad(fog(road), p1.x, p1.y, w1, p2.x, p2.y, w2);
    if (Math.floor(i / 4) % 2 && feat?.id !== "bridge") quad(fog(pal.line), p1.x, p1.y, w1 * 0.03, p2.x, p2.y, w2 * 0.03);
  }

  function propsFor(i, list) {
    const feat = featureAt(i);
    if (feat?.id === "bridge") {
      if (i % 2 === 0) for (const side of [-1, 1]) list.push({ z: i, kind: "post", rx: side * RW * 1.14 });
      return;
    }
    if (feat?.id === "cave") {
      if (i % 4 === 0) list.push({ z: i, kind: "arch", rx: 0 });
      if (i % 2 === 1) list.push({ z: i + 0.5, kind: "crystal", rx: (hash(i) < 0.5 ? -1 : 1) * RW * (1.3 + hash(i + 3)), u: hash(i + 9) });
      return;
    }
    if (feat?.id === "rainbow") {
      if (i % 3 === 0) list.push({ z: i, kind: "sparkle", rx: (hash(i) < 0.5 ? -1 : 1) * RW * (1.4 + hash(i + 5) * 2), u: hash(i + 2) });
      return;
    }
    if (i % 3) return;
    const u = hash(i);
    if (u > 0.62) return;
    const zone = propZone(zoneMix(i), hash(i + 1000));
    const side = hash(i + 2000) < 0.5 ? -1 : 1;
    const roll = hash(i + 3000);
    const kinds = {
      town: roll < 0.45 ? "house" : roll < 0.65 ? "shop" : roll < 0.82 ? "mailbox" : "lamp",
      nature: roll < 0.45 ? "pine" : roll < 0.7 ? "tree" : roll < 0.88 ? "flowers" : "rock",
      mystic: roll < 0.4 ? "mushroom" : roll < 0.65 ? "crystal" : roll < 0.85 ? "orb" : "island",
    };
    const kind = kinds[zone];
    const near = kind === "mailbox" || kind === "lamp" || kind === "flowers";
    const far = kind === "house" || kind === "shop" || kind === "island";
    const dist = near ? 1.22 + roll * 0.2 : far ? 2 + hash(i + 4000) * 1.2 : 1.4 + hash(i + 4000) * 1.6;
    list.push({ z: i + 0.5, kind, rx: side * RW * dist, u: hash(i + 5000), side, word: signs[Math.floor(hash(i + 6000) * signs.length)] });
  }

  function drawProp(p, now) {
    const g = at(p.rx, p.z, p.kind === "island" ? 4 + p.u * 2 : 0);
    if (!g) return;
    const s = g.s;
    ctx.globalAlpha = fade(g.dz);
    const rect = (c, x0, y0, w, hgt) => { ctx.fillStyle = c; ctx.fillRect(g.x + x0 * s, g.y - (y0 + hgt) * s, w * s, hgt * s); };
    const tri = (c, x0, y0, x1, y1, x2, y2) => {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(g.x + x0 * s, g.y - y0 * s); ctx.lineTo(g.x + x1 * s, g.y - y1 * s); ctx.lineTo(g.x + x2 * s, g.y - y2 * s); ctx.fill();
    };
    const dot = (c, cx, cy, r) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(g.x + cx * s, g.y - cy * s, Math.max(0.5, r * s), 0, Math.PI * 2); ctx.fill(); };
    const glow = (c, cx, cy, r) => {
      const rg = ctx.createRadialGradient(g.x + cx * s, g.y - cy * s, 0, g.x + cx * s, g.y - cy * s, r * s);
      rg.addColorStop(0, c); rg.addColorStop(1, "transparent");
      ctx.fillStyle = rg; ctx.fillRect(g.x + (cx - r) * s, g.y - (cy + r) * s, 2 * r * s, 2 * r * s);
    };
    const body = ["#e8c39e", "#c9a3d9", "#a8d0e6", "#f2b880", "#b8d8a8"][Math.floor(p.u * 5)];
    switch (p.kind) {
      case "house":
        rect(body, -1.3, 0, 2.6, 1.8);
        tri("#8a3b3b", -1.55, 1.8, 0, 3.1, 1.55, 1.8);
        rect("#ffd98a", -0.9, 0.8, 0.6, 0.55); rect("#ffd98a", 0.3, 0.8, 0.6, 0.55);
        rect("#5b3a22", -0.25, 0, 0.5, 0.95);
        break;
      case "shop": {
        rect("#4a4f63", -1.6, 0, 3.2, 2.2);
        rect("#ffe7a8", -1.3, 0.25, 2.6, 0.9);
        rect(FLAG_COLORS[Math.floor(p.u * FLAG_COLORS.length)], -1.75, 2.2, 3.5, 0.8);
        const fs = 0.42 * s;
        if (fs >= 6) {
          ctx.fillStyle = "#fff";
          ctx.font = `900 ${fs}px system-ui, sans-serif`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(p.word, g.x, g.y - 2.6 * s, 3.3 * s);
        }
        break;
      }
      case "mailbox":
        rect("#5b3a22", -0.05, 0, 0.1, 0.8);
        rect(p.u < 0.5 ? "#3f6fd9" : "#d9534f", -0.22, 0.8, 0.44, 0.3);
        rect("#ffd23f", 0.16, 1.02, 0.05, 0.22);
        break;
      case "lamp":
        rect("#2c2f3a", -0.05, 0, 0.1, 2.6);
        glow("rgba(255,220,140,.7)", 0, 2.65, 0.9);
        dot("#fff1c4", 0, 2.65, 0.16);
        break;
      case "pine":
        rect("#5b3a22", -0.12, 0, 0.24, 0.6);
        tri("#1f5a32", -1, 0.5, 0, 2.2, 1, 0.5);
        tri("#25693a", -0.8, 1.3, 0, 2.9, 0.8, 1.3);
        tri("#2d7a44", -0.55, 2.1, 0, 3.5, 0.55, 2.1);
        break;
      case "tree":
        rect("#5b3a22", -0.14, 0, 0.28, 1.2);
        dot("#3b8a3f", 0, 1.9, 0.95); dot("#47a04a", -0.4, 2.2, 0.6); dot("#47a04a", 0.45, 2.1, 0.55);
        break;
      case "flowers":
        for (let k = 0; k < 5; k++) dot(["#ff7aa8", "#ffd23f", "#ffffff", "#b48cff"][k % 4], (k - 2) * 0.22, 0.12 + (k % 2) * 0.1, 0.09);
        break;
      case "rock":
        dot("#7d8590", 0, 0.25, 0.45); dot("#9aa1ab", -0.15, 0.4, 0.22);
        break;
      case "mushroom": {
        const c = p.u < 0.5 ? "#ff7ae0" : "#7ff5e0";
        glow(`${c}88`, 0, 1, 1.4);
        rect("#f4ead5", -0.15, 0, 0.3, 0.9);
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(g.x, g.y - 0.95 * s, 0.75 * s, 0.45 * s, 0, Math.PI, 0); ctx.fill();
        dot("#fff", -0.3, 1.1, 0.08); dot("#fff", 0.25, 1.2, 0.1);
        break;
      }
      case "crystal": {
        const c = p.u < 0.5 ? "#7ff5e0" : "#c79bff";
        glow(`${c}66`, 0, 0.8, 1.3);
        tri(c, -0.35, 0, 0, 1.8, 0.35, 0);
        tri(mixColor(c, "#ffffff", 0.4), -0.6, 0, -0.35, 1.1, -0.1, 0);
        tri(mixColor(c, "#000000", 0.2), 0.15, 0, 0.45, 1.2, 0.7, 0);
        break;
      }
      case "orb": {
        const bob = reduced ? 0 : Math.sin(now / 600 + p.u * 9) * 0.15;
        glow("rgba(255,230,140,.6)", 0, 1.4 + bob, 0.9);
        dot("#fff6c9", 0, 1.4 + bob, 0.16);
        break;
      }
      case "island":
        tri("#4a3a7a", -1.4, 0, 1.4, 0, 0.1, -1.6);
        rect("#3d8a6a", -1.4, 0, 2.8, 0.25);
        dot("#7ff5e0", 0.5, 0.6, 0.25);
        rect("#5b3a22", -0.6, 0.2, 0.12, 0.6); dot("#47a04a", -0.55, 0.95, 0.4);
        break;
      case "post":
        rect("#5b3a22", -0.08, 0, 0.16, 0.9);
        rect("#7d5f3d", -0.12, 0.8, 0.24, 0.1);
        break;
      case "sparkle": {
        const tw = reduced ? 1 : 0.5 + 0.5 * Math.sin(now / 300 + p.u * 20);
        ctx.globalAlpha *= tw;
        dot(RAINBOW[Math.floor(p.u * RAINBOW.length)], 0, 0.6 + p.u, 0.12);
        break;
      }
      case "arch": {
        ctx.lineCap = "round";
        for (const [w, c] of [[0.5, "rgba(127,245,224,.35)"], [0.18, "#c9f7ff"]]) {
          ctx.strokeStyle = c;
          ctx.lineWidth = Math.max(1, w * s);
          ctx.beginPath();
          ctx.ellipse(g.x, g.y, RW * 1.35 * s, 3.4 * s, 0, Math.PI, 0);
          ctx.stroke();
        }
        for (let k = 0; k < 7; k++) {
          const a = Math.PI + (k / 6) * Math.PI, cx = Math.cos(a) * RW * 1.35, cy = -Math.sin(a) * 3.4;
          tri(k % 2 ? "#c79bff" : "#7ff5e0", cx - 0.25, cy, cx, cy + 0.7, cx + 0.25, cy);
        }
        break;
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawRow(row, now) {
    for (const gate of row.gates) {
      const l = at((gate.x - GATE_HALF) * RW, row.z), r = at((gate.x + GATE_HALF) * RW, row.z);
      if (!l || !r) continue;
      const s = l.s, a = fade(l.dz);
      ctx.globalAlpha = a;
      const bumpT = gate.bumped ? clamp01((now - gate.bumped) / 900) : 1;
      const tilt = (1 - bumpT) * Math.sin(bumpT * 20) * 0.4;
      const color = gate.color;
      const poleH = 1.6 * s;
      ctx.strokeStyle = "#e8e8e8";
      ctx.lineWidth = Math.max(1.5, 0.08 * s);
      for (const p of [l, r]) {
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - poleH); ctx.stroke();
        const wave = reduced ? 0 : Math.sin(now / 160 + p.x) * 0.08 * s;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(p.x, p.y - poleH); ctx.lineTo(p.x + 0.45 * s, p.y - poleH + 0.15 * s + wave); ctx.lineTo(p.x, p.y - poleH + 0.3 * s); ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, 0.12 * s);
      ctx.beginPath(); ctx.moveTo(l.x, l.y - poleH); ctx.lineTo(r.x, r.y - poleH); ctx.stroke();
      if (gate.caught) { ctx.globalAlpha = 1; continue; }
      const cx = (l.x + r.x) / 2, rad = Math.max(0.5 * s, l.dz < 70 ? 14 : 0);
      // The middle sign rides higher so far-off letters never cover each other.
      const lift = gate.x === 0 ? rad * 2.1 : 0;
      const cy = l.y - poleH - rad * 0.9 - lift;
      if (lift) ctx.fillRect(cx - ctx.lineWidth / 2, cy, ctx.lineWidth, l.y - poleH - cy);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      if (row.glow && gate.target && !row.judged) {
        ctx.strokeStyle = `rgba(255,210,63,${0.6 + 0.4 * Math.sin(now / 160)})`;
        ctx.lineWidth = Math.max(3, rad * 0.25);
        ctx.beginPath(); ctx.arc(0, 0, rad * 1.3, 0, Math.PI * 2); ctx.stroke();
        const bob = reduced ? 0 : Math.sin(now / 200) * rad * 0.2;
        ctx.fillStyle = "#ffd23f";
        ctx.beginPath(); ctx.moveTo(-rad * 0.5, -rad * 2.2 + bob); ctx.lineTo(rad * 0.5, -rad * 2.2 + bob); ctx.lineTo(0, -rad * 1.5 + bob); ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, rad * 0.12);
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `900 ${Math.round(rad * 1.3)}px system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(show(gate.letter), 0, rad * 0.06);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawFinish() {
    const l = at(-RW * 1.25, finishZ), r = at(RW * 1.25, finishZ);
    if (!l || !r) return;
    const s = l.s;
    ctx.globalAlpha = fade(l.dz);
    ctx.fillStyle = "#e8e8e8";
    for (const p of [l, r]) ctx.fillRect(p.x - 0.1 * s, p.y - 3.2 * s, 0.2 * s, 3.2 * s);
    const top = l.y - 3.2 * s, bh = 0.7 * s, cells = 14, cw = (r.x - l.x) / cells;
    for (let k = 0; k < cells; k++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (k + j) % 2 ? "#111" : "#fff";
      ctx.fillRect(l.x + k * cw, top + (j * bh) / 2, cw + 0.5, bh / 2 + 0.5);
    }
    const fs = Math.max(0.5 * s, l.dz < 130 ? 13 : 0);
    if (fs) {
      ctx.font = `900 ${fs}px system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const text = `${show(letter)} is for ${snack}`;
      const tw = Math.min(ctx.measureText(text).width, W * 0.9) + fs;
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath(); ctx.roundRect((l.x + r.x) / 2 - tw / 2, top - fs * 1.7, tw, fs * 1.5, fs * 0.4); ctx.fill();
      ctx.fillStyle = "#3b2a20";
      ctx.fillText(text, (l.x + r.x) / 2, top - fs * 0.95, W * 0.9);
    }
    ctx.globalAlpha = 1;
  }

  function drawBike(now) {
    const bz = camZ + AHEAD;
    const g = at(x * RW, bz);
    if (!g) return;
    const s = g.s;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath(); ctx.ellipse(0, 0, 0.32 * s, 0.08 * s, 0, 0, Math.PI * 2); ctx.fill();
    const wob = wobble * Math.sin(now / 45) * (reduced ? 0.12 : 0.3);
    ctx.rotate(lean * 0.3 + wob);
    const R = (c, x0, y0, w, hh, r = 0.04) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x0 * s, -(y0 + hh) * s, w * s, hh * s, r * s); ctx.fill(); };
    R("#1b1d24", -0.06, 0, 0.12, 0.62, 0.06);
    R("#3b3f4a", -0.03, 0.05, 0.06, 0.5, 0.03);
    R("#ff5ca8", -0.1, 0.5, 0.2, 0.12);
    const pp = Math.sin(pedal);
    R("#2c4f8a", -0.2, 0.42 + pp * 0.08, 0.12, 0.38, 0.05);
    R("#2c4f8a", 0.08, 0.42 - pp * 0.08, 0.12, 0.38, 0.05);
    R("#1b1d24", -0.22, 0.38 + pp * 0.08, 0.16, 0.07);
    R("#1b1d24", 0.06, 0.38 - pp * 0.08, 0.16, 0.07);
    R("#ff8a3d", -0.2, 0.75, 0.4, 0.5, 0.12);
    R("#2fb36a", -0.15, 0.85, 0.3, 0.32, 0.08);
    ctx.strokeStyle = "#c0c4cc"; ctx.lineWidth = Math.max(2, 0.05 * s); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-0.34 * s, -1.0 * s); ctx.lineTo(0.34 * s, -1.0 * s); ctx.stroke();
    ctx.strokeStyle = "#f2c49b"; ctx.lineWidth = Math.max(3, 0.08 * s);
    ctx.beginPath(); ctx.moveTo(-0.18 * s, -1.18 * s); ctx.lineTo(-0.3 * s, -1.0 * s); ctx.moveTo(0.18 * s, -1.18 * s); ctx.lineTo(0.3 * s, -1.0 * s); ctx.stroke();
    ctx.fillStyle = "#5b3a22";
    ctx.beginPath(); ctx.arc(0, -1.36 * s, 0.14 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3fa9f5";
    ctx.beginPath(); ctx.arc(0, -1.4 * s, 0.17 * s, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-0.03 * s, -1.57 * s, 0.06 * s, 0.17 * s);
    ctx.restore();
  }

  function drawSparks(now) {
    sparks = sparks.filter((p) => now - p.t0 < 900);
    for (const p of sparks) {
      const t = (now - p.t0) / 1000;
      const px = p.x + p.vx * t, py = p.y + p.vy * t + 300 * t * t;
      ctx.globalAlpha = 1 - t / 0.9;
      ctx.fillStyle = ["#ffd23f", "#fff", "#7ff5e0"][p.hue];
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 3 : 8;
        k ? ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r) : ctx.moveTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPopup(now) {
    if (!popup) return;
    const t = (now - popup.t0) / 1300;
    if (t > 1) { popup = null; return; }
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.font = `900 ${Math.round(30 + 6 * Math.sin(Math.min(1, t * 4) * Math.PI))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,.6)";
    const y = H * 0.2 - t * 20;
    ctx.strokeText(popup.text, W / 2, y);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, W / 2, y);
    ctx.restore();
  }

  const props = [];
  function frame(now) {
    if (!canvas.isConnected) {
      hum(false);
      removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", onHide);
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const top = rideSpeed(reduced);
    if (state === "ride") v = Math.min(top, v + 6 * dt);
    if (state === "finish") {
      v = Math.max(0, v - 8 * dt);
      if (v < 0.3) finish();
    }
    camZ += v * dt;
    const before = x;
    x = steerToward(x, targetX, dt);
    const swerve = Math.max(-1, Math.min(1, dt ? (x - before) / dt / 2 : 0));
    lean += (swerve - lean) * Math.min(1, dt * 10);
    pedal += v * dt * 1.6;
    wobble = Math.max(0, wobble - dt * 1.2);
    shake = Math.max(0, shake - dt * 2.5);
    bgX += curveAt(Math.floor(camZ)) * v * dt * 900;
    if (osc) osc.o.frequency.value = 80 + v * 3 + Math.abs(lean) * 30;

    spawnRows();
    const bz = camZ + AHEAD;
    for (const row of rows) if (!row.judged && bz >= row.z && state === "ride") judge(row, now);
    while (rows.length && rows[0].z < camZ - 2) rows.shift();
    const next = rows.find((o) => !o.judged)?.gates.find((g) => g.target);
    const label = next ? `Bike ride. The next ${letter} flag is on the ${laneName(next.x)}.` : "Bike ride.";
    if (canvas.getAttribute("aria-label") !== label) canvas.setAttribute("aria-label", label);
    if (state === "ride" && finishZ !== null && bz >= finishZ) state = "finish";

    offsets();
    camX = x * RW * CAM_FOLLOW + (shake ? Math.sin(now / 25) * shake * 0.12 : 0);
    camY = roadY(camZ) + CAM_H;
    const mix = zoneMix(bz + 20);
    const pal = paletteAt(Math.floor(bz + 20));
    drawSky(pal, mix, now);

    props.length = 0;
    for (let n = DRAW - 1; n >= 1; n--) propsFor(base + n, props);
    for (const row of rows) props.push({ z: row.z, kind: "row", row });
    if (finishZ !== null) props.push({ z: finishZ, kind: "finish" });
    props.push({ z: bz, kind: "bike" });
    props.sort((a, b) => b.z - a.z);
    let k = 0;
    for (let n = DRAW - 1; n >= 0; n--) {
      drawSegment(n);
      const near = base + n;
      while (k < props.length && props[k].z >= near) {
        const p = props[k++];
        if (p.z > camZ + DRAW) continue;
        if (p.kind === "row") drawRow(p.row, now);
        else if (p.kind === "finish") drawFinish();
        else if (p.kind === "bike") drawBike(now);
        else drawProp(p, now);
      }
    }
    drawSparks(now);
    drawPopup(now);
    looping = !(state === "done" && !popup && !sparks.length);
    if (looping) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
