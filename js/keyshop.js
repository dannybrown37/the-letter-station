import { KEYBOARD, PAINTS, FINISHES, shuffle, loadKeyboard, loadGallery, boardComplete, keyName, keyWord, makeKeyMission, missionDone, keyMeetsMission } from "./logic.js";

let ui;
let keyboard = null;
let mission = null;
let lights = false;
let gallery = null;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const anim = (el, frames, ms, easing = "ease-out") =>
  el.animate(frames, { duration: reduced() ? 1 : ms, easing, fill: "forwards" }).finished;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 1 : ms));

// ---------- sounds: all synthesized, soft, no samples ----------
let noiseBuf;
const ac = () => ui.audio();
function noise() {
  const a = ac();
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}
function envelope(node, t, peak, dur) {
  const g = ac().createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g).connect(ac().destination);
}
function burst({ type = "lowpass", freq, q = 1, peak, dur, at = 0 }) {
  const t = ac().currentTime + at;
  const n = noise();
  const f = ac().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  n.connect(f);
  envelope(f, t, peak, dur);
  n.start(t);
  n.stop(t + dur + 0.05);
}
function sweep({ from, to, dur, peak, type = "sine", at = 0 }) {
  const t = ac().currentTime + at;
  const o = ac().createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  envelope(o, t, peak, dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const safe = (fn) => (...args) => { try { fn(...args); } catch { /* sound is a bonus */ } };
const sfx = {
  thock: safe((at = 0) => {
    sweep({ from: 190, to: 85, dur: 0.09, peak: 0.28, at });
    burst({ freq: 900, peak: 0.12, dur: 0.04, at });
  }),
  pop: safe(() => {
    sweep({ from: 240, to: 950, dur: 0.07, peak: 0.2 });
    burst({ type: "bandpass", freq: 1800, q: 2, peak: 0.1, dur: 0.03 });
  }),
  snap: safe(() => {
    burst({ type: "highpass", freq: 3200, peak: 0.14, dur: 0.02 });
    sweep({ from: 2300, to: 1500, dur: 0.03, peak: 0.05, type: "triangle" });
    sfx.thock(0.012);
  }),
  dip: safe(() => {
    sweep({ from: 520, to: 170, dur: 0.12, peak: 0.16 });
    sweep({ from: 760, to: 300, dur: 0.1, peak: 0.08, at: 0.07 });
  }),
  sparkle: safe(() => [1568, 2093, 2637, 3136, 4186].forEach((f, i) =>
    sweep({ from: f, to: f * 1.01, dur: 0.3, peak: 0.05, type: "triangle", at: i * 0.055 }))),
  puff: safe(() => {
    burst({ type: "bandpass", freq: 900, q: 0.6, peak: 0.14, dur: 0.4 });
    burst({ type: "highpass", freq: 4000, peak: 0.05, dur: 0.25, at: 0.05 });
  }),
  oops: safe(() => sweep({ from: 320, to: 250, dur: 0.14, peak: 0.07, type: "triangle" })),
};

// Brush = soft bandpassed noise. Sandpaper = brighter noise chopped by a fast square LFO, so it sounds gritty.
let swish = null;
const swishStart = safe((sand = false) => {
  if (swish) return;
  const n = noise();
  n.loop = true;
  const f = ac().createBiquadFilter();
  f.type = sand ? "highpass" : "bandpass";
  f.frequency.value = sand ? 2400 : 1500;
  f.Q.value = 0.7;
  const g = ac().createGain();
  g.gain.value = 0;
  let out = g;
  let lfo = null;
  if (sand) {
    const grit = ac().createGain();
    grit.gain.value = 0.6;
    lfo = ac().createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 22;
    const depth = ac().createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(grit.gain);
    lfo.start();
    g.connect(grit);
    out = grit;
  }
  n.connect(f).connect(g);
  out.connect(ac().destination);
  n.start();
  swish = { n, g, f, lfo, sand };
});
const swishSpeed = safe((pxPerMs) => {
  if (!swish) return;
  const t = ac().currentTime;
  swish.g.gain.setTargetAtTime(Math.min(swish.sand ? 0.2 : 0.13, pxPerMs * (swish.sand ? 0.08 : 0.05)), t, 0.03);
  if (swish.lfo) swish.lfo.frequency.setTargetAtTime(14 + Math.min(40, pxPerMs * 25), t, 0.05);
  else swish.f.frequency.setTargetAtTime(1100 + Math.min(1500, pxPerMs * 600), t, 0.05);
});
const swishStop = safe(() => {
  if (!swish) return;
  const t = ac().currentTime;
  swish.g.gain.setTargetAtTime(0, t, 0.05);
  swish.n.stop(t + 0.3);
  swish.lfo?.stop(t + 0.3);
  swish = null;
});

// ---------- keycap faces ----------
const RAINBOW = ["#ff4d5e", "#ff8a3d", "#ffd23f", "#36c275", "#3fa9f5", "#8f6bff", "#ff5ca8"];
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (hex, other, t) => {
  const a = rgbOf(hex);
  const b = rgbOf(other);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
};
const isLight = (hex) => { const [r, g, b] = rgbOf(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 150; };

function seededRng(str) {
  let s = [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483647, 7) || 7;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}


function drawFinish(g, w, h, { c, f }) {
  const u = Math.min(w, h);
  g.fillStyle = c;
  g.fillRect(0, 0, w, h);
  if (f === "stripes") {
    g.fillStyle = mix(c, "#ffffff", 0.6);
    const step = u / 4;
    for (let x = -h; x < w + h; x += step) {
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + step / 2, 0); g.lineTo(x + step / 2 - h, h); g.lineTo(x - h, h);
      g.fill();
    }
  } else if (f === "dots") {
    g.fillStyle = mix(c, "#ffffff", 0.75);
    const step = u / 4.2;
    for (let row = 0, y = step / 2; y < h + step; y += step, row++) {
      for (let x = row % 2 ? step : step / 2; x < w + step; x += step) {
        g.beginPath(); g.arc(x, y, u / 16, 0, Math.PI * 2); g.fill();
      }
    }
  } else if (f === "glitter") {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, mix(c, "#ffffff", 0.25));
    grad.addColorStop(1, mix(c, "#000000", 0.3));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const rng = seededRng(c);
    const specks = ["#ffffff", "#fff3b0", mix(c, "#ffffff", 0.8)];
    const area = (w * h) / (u * u);
    for (let i = 0; i < u * 2.4 * area; i++) {
      g.fillStyle = specks[i % 3];
      g.globalAlpha = 0.5 + rng() * 0.5;
      const s = (0.6 + rng() * 1.6) * (u / 72);
      g.fillRect(rng() * w, rng() * h, s, s);
    }
    g.globalAlpha = 1;
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 5 * area; i++) {
      const x = rng() * w, y = rng() * h, r = (2 + rng() * 3) * (u / 72);
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r / 4, y - r / 4); g.lineTo(x + r, y); g.lineTo(x + r / 4, y + r / 4);
      g.lineTo(x, y + r); g.lineTo(x - r / 4, y + r / 4); g.lineTo(x - r, y); g.lineTo(x - r / 4, y - r / 4);
      g.fill();
    }
  } else if (f === "rainbow") {
    const grad = g.createLinearGradient(0, 0, w, h);
    RAINBOW.forEach((col, i) => grad.addColorStop(i / (RAINBOW.length - 1), col));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  } else if (f === "split") {
    g.fillStyle = mix(c, "#ffffff", 0.72);
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w, h); g.lineTo(0, h); g.fill();
  }
}

// Sanded keycap: matte raw plastic with fine scratches.
function drawRaw(g, w, h) {
  const u = Math.min(w, h);
  g.fillStyle = "#d8d2c6";
  g.fillRect(0, 0, w, h);
  const rng = seededRng("raw");
  for (let i = 0; i < (w * h * 6) / u; i++) {
    g.fillStyle = rng() < 0.5 ? "rgba(255,255,255,.35)" : "rgba(90,80,70,.18)";
    const s = (0.5 + rng()) * (u / 180);
    g.fillRect(rng() * w, rng() * h, s, s);
  }
  g.strokeStyle = "rgba(255,255,255,.25)";
  g.lineWidth = u / 360;
  for (let i = 0; i < 40; i++) {
    const x = rng() * w, y = rng() * h, a = (rng() - 0.5) * 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * u / 6, y + Math.sin(a) * u / 6); g.stroke();
  }
}

const faceCache = new Map();
function faceUrl(key) {
  if (key.img) return key.img;
  const id = `${key.c}|${key.f}`;
  if (!faceCache.has(id)) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 96;
    drawFinish(cv.getContext("2d"), 96, 96, key);
    faceCache.set(id, cv.toDataURL());
  }
  return faceCache.get(id);
}

const KEY_BY_ID = Object.fromEntries(KEYBOARD.map((k) => [k.id, k]));
const LETTER = /^[A-Z]$/;

function dressKey(el, key) {
  const top = el.querySelector(".kc-top");
  top.style.backgroundImage = key ? `url(${faceUrl(key)})` : "";
  const base = key ? (key.f === "rainbow" ? "#7b4fd6" : key.c) : null;
  el.style.setProperty("--skirt", base ? mix(base, "#000000", 0.4) : "");
  el.classList.toggle("light", Boolean(key && !key.img && key.f !== "rainbow" && isLight(key.c)));
  el.classList.toggle("painted", Boolean(key));
}

function keycap(id, key, props = {}) {
  const label = KEY_BY_ID[id].label;
  const el = ui.h("button", { class: "kc", "aria-label": keyName(id), ...props },
    ui.h("span", { class: "kc-top" }, ui.h("span", { class: label.length > 1 ? "legend long" : "legend" }, label)));
  dressKey(el, key);
  return el;
}

// Row 2 of the grid is a thin spacer under the function row, like a real board.
function placeKey(el, k) {
  el.style.gridColumn = `${k.x * 4 + 1} / span ${k.w * 4}`;
  el.style.gridRow = `${k.y === 0 ? 1 : k.y + 2} / span ${k.h}`;
  return el;
}

const STEMS = ["#e5484d", "#3e8ef7", "#a0703f", "#f5c518", "#2fbf71"];
const switchEl = () => ui.h("span", { class: "switch" }, ui.h("span", { class: "stem" }));
const withStem = (el, id) => {
  const n = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  el.style.setProperty("--stem", STEMS[n % STEMS.length]);
  return el;
};
const slotFor = (k) => placeKey(ui.h("div", { class: "kc bare" }, withStem(switchEl(), k.id)), k);

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
}
const puller = () => svgEl("svg", { class: "puller", viewBox: "0 0 60 110", width: "60", height: "110" },
  svgEl("circle", { cx: 30, cy: 18, r: 14, fill: "none", stroke: "#d9deea", "stroke-width": 6 }),
  svgEl("path", { d: "M23 31 L13 98 L22 104 M37 31 L47 98 L38 104", fill: "none", stroke: "#d9deea", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }));

const finishLabel = (f) => FINISHES.find((x) => x.id === f).label;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function keyLine(id) {
  if (LETTER.test(id)) { const w = keyWord(id); return w ? `${id} is for ${w}!` : `${id}!`; }
  return `${cap1(keyName(id))}!`;
}
const save = () => ui.store.set("keyboard", keyboard);
const paintedCount = () => KEYBOARD.filter((k) => keyboard[k.id]).length;

// ---------- the shop ----------
export function keyShop(ctx) {
  ui = ctx;
  keyboard ??= loadKeyboard(ui.store.get("keyboard", {}));
  gallery ??= loadGallery(ui.store.get("keyGallery", []));
  mission ??= makeKeyMission();
  shop();
}

function missionCard() {
  const m = mission;
  const done = missionDone(keyboard, m);
  return ui.h("div", { class: `card mission${done ? " done" : ""}` },
    ui.h("div", { class: "sub" }, done ? "🎉 Mission done!" : "🎯 Mission"),
    ui.h("div", { class: "prompt" }, m.text),
    ui.h("div", { class: "mission-keys" }, m.letters.map((l) => {
      const cap = keycap(l, keyboard[l], { tabindex: "-1", "aria-hidden": "true" });
      cap.classList.add("mini");
      if (keyMeetsMission(keyboard[l], m)) cap.classList.add("got");
      return cap;
    })),
    done
      ? ui.h("button", { class: "next", onclick: () => { mission = makeKeyMission(); shop(); } }, "Next mission ➡️")
      : ui.h("button", { class: "say", onclick: () => ui.speak(m.text) }, "🔊 Hear it"));
}

function caseEl(keys, extra = "") {
  return ui.h("div", { class: `kb${lights ? " rgb" : ""}${extra}` },
    ui.h("span", { class: "screw tl" }), ui.h("span", { class: "screw tr" }),
    ui.h("span", { class: "screw bl" }), ui.h("span", { class: "screw br" }),
    ui.h("div", { class: "plate" }, keys));
}

function shop() {
  let busy = false;
  const keys = {};
  const bench = ui.h("div", { class: "bench" });
  const mCard = missionCard();
  const board = caseEl(KEYBOARD.map((k) => {
    keys[k.id] = placeKey(keycap(k.id, keyboard[k.id], { onclick: () => !busy && pull(k.id) }), k);
    if (mission.letters.includes(k.id) && !keyMeetsMission(keyboard[k.id], mission)) keys[k.id].classList.add("target");
    return keys[k.id];
  }));
  const scroller = ui.h("div", { class: "kb-scroll" }, board);
  const full = boardComplete(keyboard);

  const doneCard = full ? ui.h("div", { class: "card finished" },
    ui.h("div", { class: "prompt" }, "🎉 Every key is painted!"),
    ui.h("button", { class: "next", onclick: hang }, "🖼️ Hang it in the gallery!")) : "";

  const idle = () => bench.replaceChildren(
    ui.h("div", { class: "bench-hint" }, "🔧 Tap any key to pull it off!"),
    ui.h("div", { class: "tools" },
      ui.h("button", { class: `tool${lights ? " on" : ""}`, onclick: () => { lights = !lights; board.classList.toggle("rgb", lights); sfx.thock(); idle(); } }, lights ? "💡 Lights on" : "💡 Lights"),
      ui.h("button", { class: "tool", onclick: () => !busy && popAll(keys) }, "🫧 Pop them all!"),
      ui.h("button", { class: "tool wide", onclick: () => { sfx.thock(); galleryScreen(); } }, `🖼️ Gallery (${gallery.length})`)));

  function hang() {
    const next = [...gallery, keyboard];
    try {
      ui.store.set("keyGallery", next);
    } catch {
      doneCard.append(ui.h("div", { class: "sub" }, "The gallery is full! Ask a grown-up for help."));
      ui.say("The gallery is full! Ask a grown-up for help.");
      return;
    }
    gallery = next;
    keyboard = {};
    save();
    ui.celebrate("Your keyboard is in the gallery!");
    galleryScreen(gallery.length - 1);
  }

  async function pull(id) {
    busy = true;
    const k = keys[id];
    const tool = puller();
    board.append(tool);
    tool.style.left = `${k.offsetLeft + k.offsetWidth / 2 - 30}px`;
    tool.style.top = `${k.offsetTop - 62}px`;
    await anim(tool, [{ transform: "translateY(-50px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], 260);
    sfx.pop();
    ui.say(cap1(keyName(id)));
    const ghost = k.cloneNode(true);
    ghost.classList.add("ghost");
    Object.assign(ghost.style, { left: `${k.offsetLeft}px`, top: `${k.offsetTop}px`, width: `${k.offsetWidth}px`, height: `${k.offsetHeight}px`, gridColumn: "", gridRow: "" });
    board.append(ghost);
    k.replaceChildren(withStem(switchEl(), id));
    k.classList.add("bare");
    await Promise.all([
      anim(tool, [{ transform: "translateY(0)" }, { transform: "translateY(-70px)", opacity: 0 }], 380, "cubic-bezier(.3,1.6,.6,1)"),
      anim(ghost, [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-70px) rotate(-12deg)", opacity: 0 }], 380, "cubic-bezier(.3,1.6,.6,1)"),
    ]);
    tool.remove();
    ghost.remove();
    studio(id, async (newKey) => {
      const wasFull = boardComplete(keyboard);
      const wasDone = missionDone(keyboard, mission);
      if (newKey) { keyboard[id] = newKey; save(); }
      const fresh = placeKey(keycap(id, keyboard[id], { onclick: () => !busy && pull(id) }), KEY_BY_ID[id]);
      k.replaceWith(fresh);
      keys[id] = fresh;
      fresh.scrollIntoView({ block: "center", inline: "center", behavior: reduced() ? "auto" : "smooth" });
      await wait(300);
      await anim(fresh, [{ transform: "translateY(-60px) scale(1.15)", opacity: 0 }, { transform: "translateY(4px)", opacity: 1, offset: 0.8 }, { transform: "translateY(0)", opacity: 1 }], 320, "ease-in");
      sfx.snap();
      busy = false;
      if (!newKey) { shop(); return; }
      const big = !wasFull && boardComplete(keyboard) ? "You painted every single key!" : !wasDone && missionDone(keyboard, mission) ? "Mission done!" : null;
      if (big) ui.celebrate(big);
      else ui.say(`${newKey.f === "solid" ? "" : finishLabel(newKey.f)} ${keyLine(id)}`);
      setTimeout(shop, big ? 900 : 700);
    });
  }

  function studio(id, done) {
    const spec = KEY_BY_ID[id];
    const paints = PAINTS.some((p) => p.color === mission.color) || !mission.color ? PAINTS : [{ name: mission.colorName, color: mission.color }, ...PAINTS];
    const start = keyboard[id] ?? { c: paints[0].color, f: "solid" };
    let brush = { c: paints.some((p) => p.color === start.c) ? start.c : paints[0].color, f: start.f };
    let phase = "sand";
    let finished = false;
    let usedPaint = false;

    const aspect = spec.w / spec.h;
    const CH = aspect < 1 ? 220 : aspect > 1.5 ? 130 : 170;
    const CW = aspect < 1 ? 120 : Math.round(Math.min(310, CH * aspect));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const makeCanvas = () => ui.h("canvas", { class: "paint-canvas", width: Math.round(CW * dpr), height: Math.round(CH * dpr) });
    const sandCv = makeCanvas();
    const cv = makeCanvas();
    const sg = sandCv.getContext("2d", { willReadFrequently: true });
    const g = cv.getContext("2d", { willReadFrequently: true });
    const patternOf = (ctx, draw) => {
      const off = document.createElement("canvas");
      off.width = cv.width;
      off.height = cv.height;
      draw(off.getContext("2d"), off.width, off.height);
      return ctx.createPattern(off, "no-repeat");
    };
    const rawPattern = patternOf(sg, drawRaw);
    let pattern;
    const makePattern = () => { pattern = patternOf(g, (c, w, h) => drawFinish(c, w, h, brush)); };
    makePattern();

    const paper = ui.h("span", { class: "sandpaper" });
    const big = keycap(id, keyboard[id], { tabindex: "-1" });
    big.classList.add("big");
    Object.assign(big.style, { width: `${CW + 24}px`, height: `${CH + 24}px` });
    big.querySelector(".kc-top").prepend(sandCv, cv);
    big.querySelector(".kc-top").append(paper);

    const meter = ui.h("div", { class: "meter" }, ui.h("span"));
    const hint = ui.h("div", { class: "bench-hint" }, "🟫 Rub with the sandpaper to make it smooth!");
    const sandBtn = ui.h("button", { class: "next sand-btn", hidden: true, onclick: () => sanded() }, "✨ All smooth!");
    const doneBtn = ui.h("button", { class: "next finish-btn", hidden: true, onclick: () => complete() }, "✅ Done! Put it on");
    const paintTools = ui.h("div", { class: "paint-tools", hidden: true });

    const coverage = (ctx, canvas) => {
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hit = 0, all = 0;
      const step = 6 * dpr;
      for (let y = step / 2; y < canvas.height; y += step) {
        for (let x = step / 2; x < canvas.width; x += step) {
          all++;
          if (d[(Math.floor(y) * canvas.width + Math.floor(x)) * 4 + 3] > 40) hit++;
        }
      }
      return hit / all;
    };
    // The meter only shows progress; he decides when each step is done.
    const updateMeter = () => {
      const [ctx, canvas] = phase === "sand" ? [sg, sandCv] : [g, cv];
      const amount = coverage(ctx, canvas);
      meter.firstChild.style.width = `${Math.round(amount * 100)}%`;
      if (phase === "sand") sandBtn.hidden = amount < 0.15;
      else doneBtn.hidden = !usedPaint;
    };

    const local = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    const splat = (x, y) => {
      g.fillStyle = pattern;
      g.beginPath(); g.arc(x, y, 20 * dpr, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, d = (18 + Math.random() * 14) * dpr;
        g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, (3 + Math.random() * 6) * dpr, 0, Math.PI * 2); g.fill();
      }
    };
    const stroke = (x0, y0, x1, y1) => {
      g.strokeStyle = pattern;
      g.lineCap = g.lineJoin = "round";
      g.lineWidth = 34 * dpr;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
      g.lineWidth = 4 * dpr;
      for (const off of [-21, -15, 15, 21]) {
        if (Math.random() < 0.35) continue;
        g.beginPath();
        g.moveTo(x0 + nx * off * dpr, y0 + ny * off * dpr);
        g.lineTo(x1 + nx * off * dpr, y1 + ny * off * dpr);
        g.stroke();
      }
    };
    const scuff = (x, y) => {
      sg.fillStyle = rawPattern;
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * 28 * dpr;
        sg.fillRect(x + Math.cos(a) * d - 4 * dpr, y + Math.sin(a) * d - 2 * dpr, (5 + Math.random() * 9) * dpr, (2 + Math.random() * 3) * dpr);
      }
    };
    const sandLine = (x0, y0, x1, y1) => {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (8 * dpr)));
      for (let i = 1; i <= n; i++) scuff(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    };
    const movePaper = ([x, y]) => {
      paper.style.transform = `translate(${x / dpr - 30}px, ${y / dpr - 24}px) rotate(${Math.sin(x / 20) * 8 - 8}deg)`;
    };

    let last = null, lastT = 0, moves = 0;
    cv.addEventListener("pointerdown", (e) => {
      if (finished) return;
      cv.setPointerCapture(e.pointerId);
      last = local(e);
      lastT = e.timeStamp;
      if (phase === "sand") {
        scuff(...last);
        movePaper(last);
        paper.classList.add("on");
        swishStart(true);
      } else {
        splat(...last);
        usedPaint = true;
        swishStart();
      }
      swishSpeed(0.6);
      updateMeter();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!last || finished) return;
      const p = local(e);
      if (phase === "sand") {
        sandLine(...last, ...p);
        movePaper(p);
        if (moves % 3 === 0) dust(e.clientX, e.clientY, 2);
      } else {
        stroke(...last, ...p);
      }
      const dt = Math.max(1, e.timeStamp - lastT);
      swishSpeed(Math.hypot(p[0] - last[0], p[1] - last[1]) / dpr / dt);
      last = p;
      lastT = e.timeStamp;
      if (++moves % 5 === 0) updateMeter();
    });
    const lift = () => {
      if (!last) return;
      last = null;
      swishStop();
      paper.classList.remove("on");
      if (!finished) updateMeter();
    };
    cv.addEventListener("pointerup", lift);
    cv.addEventListener("pointercancel", lift);

    function sanded() {
      if (phase !== "sand") return;
      phase = "paint";
      last = null;
      swishStop();
      paper.classList.remove("on");
      sg.fillStyle = rawPattern;
      sg.fillRect(0, 0, sandCv.width, sandCv.height);
      sfx.puff();
      const r = big.getBoundingClientRect();
      dust(r.left + r.width / 2, r.top + r.height / 2, 24, 90);
      meter.firstChild.style.width = "0%";
      sandBtn.hidden = true;
      hint.textContent = "🖌️ Paint as many layers as you want! Tap ✅ Done when it looks perfect.";
      paintTools.hidden = false;
      anim(paintTools, [{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], 350);
      ui.say("So smooth! Now pick a paint!");
    }

    async function complete() {
      if (finished) return;
      finished = true;
      swishStop();
      const snap = document.createElement("canvas");
      snap.height = 48;
      snap.width = Math.round((48 * CW) / CH);
      const sc = snap.getContext("2d");
      sc.drawImage(sandCv, 0, 0, snap.width, snap.height);
      sc.drawImage(cv, 0, 0, snap.width, snap.height);
      const img = snap.toDataURL("image/jpeg", 0.82);
      big.classList.add("shine");
      sfx.sparkle();
      sparkles(big);
      await wait(1000);
      done({ ...brush, img });
    }

    const potRow = ui.h("div", { class: "pots" });
    const finishRow = ui.h("div", { class: "finishes" });
    const drawPickers = () => {
      potRow.replaceChildren(...paints.map((p) => {
        const pot = ui.h("button", {
          class: `pot${brush.c === p.color && brush.f !== "rainbow" ? " on" : ""}${p.color === mission.color ? " goal" : ""}`,
          "aria-label": p.name,
          onclick: () => { brush = { c: p.color, f: brush.f === "rainbow" ? "solid" : brush.f }; makePattern(); drawPickers(); sfx.dip(); ui.say(p.name); },
        }, ui.h("span", { class: "paint" }));
        pot.style.setProperty("--paint", p.color);
        return pot;
      }));
      finishRow.replaceChildren(...FINISHES.map((f) => ui.h("button", {
        class: `finish${brush.f === f.id ? " on" : ""}${mission.finish === f.id ? " goal" : ""}`,
        onclick: () => { brush = { ...brush, f: f.id }; makePattern(); drawPickers(); sfx.thock(); ui.say(f.label); },
      }, ui.h("span", { class: "swatch", style: { backgroundImage: `url(${faceUrl({ c: brush.c, f: f.id })})` } }), f.label)));
    };
    drawPickers();

    paintTools.append(
      ui.h("div", { class: "picker-label" }, "🎨 Paint"),
      potRow,
      ui.h("div", { class: "picker-label" }, "✨ Style"),
      finishRow,
      doneBtn);

    bench.replaceChildren(
      ui.h("div", { class: "mat" }, big, hint, meter),
      sandBtn,
      paintTools,
      ui.h("button", { class: "tool back", onclick: () => { if (!finished) { finished = true; swishStop(); done(null); } } }, "↩️ Put it back"));
    bench.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
  }

  idle();
  ui.screen("Key Shop ⌨️",
    mCard,
    doneCard,
    ui.h("div", { class: "kb-count" }, `🎨 ${paintedCount()} of ${KEYBOARD.length} keys painted · ↔️ swipe for more`),
    scroller,
    bench);
  if (!full && !missionDone(keyboard, mission)) ui.say(mission.text);
  else if (full) ui.say("Every key is painted! Hang it in the gallery!");
}

function sparkles(el) {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 14; i++) {
    const s = ui.h("span", { class: "spark" }, i % 2 ? "✨" : "⭐");
    s.style.left = `${r.left + r.width / 2}px`;
    s.style.top = `${r.top + r.height / 2}px`;
    document.body.append(s);
    const a = (i / 14) * Math.PI * 2, d = 90 + Math.random() * 60;
    anim(s, [{ transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1.1)`, opacity: 0 }], 800)
      .then(() => s.remove());
  }
}

function dust(x, y, n, spread = 30) {
  for (let i = 0; i < n; i++) {
    const d = ui.h("span", { class: "dust" });
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    document.body.append(d);
    const dx = (Math.random() - 0.5) * spread * 2, dy = 20 + Math.random() * (40 + spread);
    anim(d, [{ transform: "translate(-50%,-50%)", opacity: 0.9 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.4)`, opacity: 0 }], 600 + Math.random() * 400)
      .then(() => d.remove());
  }
}

// ---------- gallery ----------
function galleryScreen(newest = -1) {
  const frames = gallery.map((b, i) => {
    const mini = caseEl(KEYBOARD.map((k) => {
      const el = ui.h("span", { class: "kc" }, ui.h("span", { class: "kc-top" }));
      dressKey(el, b[k.id]);
      return placeKey(el, k);
    }), " tiny");
    return ui.h("button", {
      class: `frame${i === newest ? " new" : ""}`,
      onclick: () => { mini.classList.toggle("rgb"); sfx.thock(); ui.speak(`Keyboard number ${i + 1}!`); },
    }, mini, ui.h("span", { class: "plaque" }, `Keyboard #${i + 1}`));
  }).reverse();
  ui.screen("Gallery 🖼️",
    ui.h("div", { class: "card" },
      ui.h("div", { class: "prompt" }, "🖼️ Your keyboards"),
      ui.h("div", { class: "sub" }, frames.length ? "Tap one to light it up!" : "No keyboards yet! Paint every key to hang one here.")),
    ui.h("div", { class: "gallery" }, frames),
    ui.h("button", { class: "next", onclick: shop }, "⌨️ Back to the shop"));
  ui.say(frames.length ? `You have ${frames.length} ${frames.length === 1 ? "keyboard" : "keyboards"} in the gallery!` : "No keyboards yet!");
}

// ---------- pop them all: keys scatter, he puts the letters back A to Z ----------
async function popAll(keys) {
  const ids = Object.keys(keys);
  const gap = reduced() ? 0 : 14;
  ids.forEach((id, i) => setTimeout(() => {
    if (i % 4 === 0) sfx.pop();
    const dx = (Math.random() - 0.5) * 300, dr = (Math.random() - 0.5) * 720;
    anim(keys[id], [{ transform: "none" }, { transform: `translate(${dx}px, -120px) rotate(${dr / 2}deg)`, offset: 0.4 }, { transform: `translate(${dx * 1.4}px, 420px) rotate(${dr}deg)`, opacity: 0 }], 900, "cubic-bezier(.2,.6,.6,1)");
  }, i * gap));
  await wait(ids.length * gap + 800);
  rebuild();
}

function rebuild() {
  const order = KEYBOARD.filter((k) => LETTER.test(k.id)).map((k) => k.id).sort();
  let next = 0;
  const slots = Object.fromEntries(KEYBOARD.map((k) => [k.id, slotFor(k)]));
  const prompt = ui.h("div", { class: "prompt" });
  const ask = () => { prompt.textContent = `Find ${order[next]}!`; };
  const board = caseEl(Object.values(slots));
  const scroller = ui.h("div", { class: "kb-scroll" }, board);

  const drop = (id, onclick) => {
    const placed = placeKey(keycap(id, keyboard[id], { onclick }), KEY_BY_ID[id]);
    slots[id].replaceWith(placed);
    slots[id] = placed;
    return anim(placed, [{ transform: "translateY(-50px) scale(1.2)", opacity: 0 }, { transform: "translateY(3px)", opacity: 1, offset: 0.8 }, { transform: "none", opacity: 1 }], 260, "ease-in");
  };

  const trayEl = ui.h("div", { class: "tray" }, shuffle(order).map((l) => {
    const cap = keycap(l, keyboard[l], {
      onclick: async () => {
        if (cap.classList.contains("used")) return;
        if (l !== order[next]) {
          sfx.oops();
          anim(cap, [{ transform: "rotate(0)" }, { transform: "rotate(-10deg)" }, { transform: "rotate(10deg)" }, { transform: "rotate(0)" }], 360);
          ui.say(`That's ${l}. Find ${order[next]}!`);
          return;
        }
        cap.classList.add("used");
        slots[l].scrollIntoView({ block: "nearest", inline: "center", behavior: reduced() ? "auto" : "smooth" });
        drop(l, () => ui.speak(keyLine(l))).then(() => sfx.snap());
        next += 1;
        if (next < order.length) {
          ask();
          ui.say(`${l}! Now find ${order[next]}!`);
          return;
        }
        prompt.textContent = "All the letters are back! 🎉";
        trayEl.replaceChildren();
        ui.say("All the letters are back! Here come the other keys!");
        const rest = KEYBOARD.filter((k) => !LETTER.test(k.id));
        for (const [i, k] of rest.entries()) {
          await wait(reduced() ? 0 : 35);
          drop(k.id, () => ui.speak(keyLine(k.id))).then(() => { if (i % 3 === 0) sfx.snap(); });
        }
        await wait(400);
        prompt.textContent = "All fixed! 🎉";
        ui.celebrate("You put the whole keyboard back together!");
        board.classList.add("rgb");
        trayEl.replaceWith(ui.h("button", { class: "next", onclick: shop }, "Back to the shop ⌨️"));
      },
    });
    return cap;
  }));

  ask();
  ui.screen("Key Shop ⌨️",
    ui.h("div", { class: "card" },
      ui.h("div", { class: "sub" }, "🫧 Uh oh, all the keys popped off!"),
      prompt,
      ui.h("button", { class: "say", onclick: () => ui.speak(prompt.textContent) }, "🔊 Hear it")),
    scroller,
    trayEl);
  ui.say(`Uh oh, all the keys popped off! Let's put the letters back. Find ${order[0]}!`);
}
