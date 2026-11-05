import { KEY_ROWS, PAINTS, FINISHES, shuffle, loadKeyboard, keyWord, makeKeyMission, missionDone, keyMeetsMission } from "./logic.js";

let ui;
let keyboard = null;
let mission = null;
let lights = false;

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
  oops: safe(() => sweep({ from: 320, to: 250, dur: 0.14, peak: 0.07, type: "triangle" })),
};

let swish = null;
const swishStart = safe(() => {
  if (swish) return;
  const n = noise();
  n.loop = true;
  const f = ac().createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1500;
  f.Q.value = 0.7;
  const g = ac().createGain();
  g.gain.value = 0;
  n.connect(f).connect(g).connect(ac().destination);
  n.start();
  swish = { n, g, f };
});
const swishSpeed = safe((pxPerMs) => {
  if (!swish) return;
  const t = ac().currentTime;
  swish.g.gain.setTargetAtTime(Math.min(0.13, pxPerMs * 0.05), t, 0.03);
  swish.f.frequency.setTargetAtTime(1100 + Math.min(1500, pxPerMs * 600), t, 0.05);
});
const swishStop = safe(() => {
  if (!swish) return;
  const t = ac().currentTime;
  swish.g.gain.setTargetAtTime(0, t, 0.05);
  swish.n.stop(t + 0.3);
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

function drawFinish(g, w, { c, f }) {
  g.fillStyle = c;
  g.fillRect(0, 0, w, w);
  if (f === "stripes") {
    g.fillStyle = mix(c, "#ffffff", 0.6);
    const step = w / 4;
    for (let x = -w; x < w * 2; x += step) {
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + step / 2, 0); g.lineTo(x + step / 2 - w, w); g.lineTo(x - w, w);
      g.fill();
    }
  } else if (f === "dots") {
    g.fillStyle = mix(c, "#ffffff", 0.75);
    const step = w / 4.2;
    for (let row = 0, y = step / 2; y < w + step; y += step, row++) {
      for (let x = row % 2 ? step : step / 2; x < w + step; x += step) {
        g.beginPath(); g.arc(x, y, w / 16, 0, Math.PI * 2); g.fill();
      }
    }
  } else if (f === "glitter") {
    const grad = g.createLinearGradient(0, 0, w, w);
    grad.addColorStop(0, mix(c, "#ffffff", 0.25));
    grad.addColorStop(1, mix(c, "#000000", 0.3));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    const rng = seededRng(c);
    const specks = ["#ffffff", "#fff3b0", mix(c, "#ffffff", 0.8)];
    for (let i = 0; i < w * 2.4; i++) {
      g.fillStyle = specks[i % 3];
      g.globalAlpha = 0.5 + rng() * 0.5;
      const s = (0.6 + rng() * 1.6) * (w / 72);
      g.fillRect(rng() * w, rng() * w, s, s);
    }
    g.globalAlpha = 1;
    g.fillStyle = "#ffffff";
    for (let i = 0; i < 5; i++) {
      const x = rng() * w, y = rng() * w, r = (2 + rng() * 3) * (w / 72);
      g.beginPath();
      g.moveTo(x, y - r); g.lineTo(x + r / 4, y - r / 4); g.lineTo(x + r, y); g.lineTo(x + r / 4, y + r / 4);
      g.lineTo(x, y + r); g.lineTo(x - r / 4, y + r / 4); g.lineTo(x - r, y); g.lineTo(x - r / 4, y - r / 4);
      g.fill();
    }
  } else if (f === "rainbow") {
    const grad = g.createLinearGradient(0, 0, w, w);
    RAINBOW.forEach((col, i) => grad.addColorStop(i / (RAINBOW.length - 1), col));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  } else if (f === "split") {
    g.fillStyle = mix(c, "#ffffff", 0.72);
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w, w); g.lineTo(0, w); g.fill();
  }
}

const faceCache = new Map();
function faceUrl(key) {
  const id = `${key.c}|${key.f}`;
  if (!faceCache.has(id)) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 96;
    drawFinish(cv.getContext("2d"), 96, key);
    faceCache.set(id, cv.toDataURL());
  }
  return faceCache.get(id);
}

function dressKey(el, key) {
  const top = el.querySelector(".kc-top");
  top.style.backgroundImage = key ? `url(${faceUrl(key)})` : "";
  const base = key ? (key.f === "rainbow" ? "#7b4fd6" : key.c) : null;
  el.style.setProperty("--skirt", base ? mix(base, "#000000", 0.4) : "");
  el.classList.toggle("light", Boolean(key && key.f !== "rainbow" && isLight(key.c)));
  el.classList.toggle("painted", Boolean(key));
}

function keycap(letter, key, props = {}) {
  const el = ui.h("button", { class: "kc", "aria-label": letter, ...props }, ui.h("span", { class: "kc-top" }, ui.h("span", { class: "legend" }, letter)));
  dressKey(el, key);
  return el;
}

const STEMS = ["#e5484d", "#3e8ef7", "#a0703f", "#f5c518", "#2fbf71"];
const switchEl = () => ui.h("span", { class: "switch" }, ui.h("span", { class: "stem" }));
const withStem = (el, letter) => { el.style.setProperty("--stem", STEMS[letter.charCodeAt(0) % STEMS.length]); return el; };

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
const keyLine = (l) => { const w = keyWord(l); return w ? `${l} is for ${w}!` : `${l}!`; };
const save = () => ui.store.set("keyboard", keyboard);

// ---------- the shop ----------
export function keyShop(ctx) {
  ui = ctx;
  keyboard ??= loadKeyboard(ui.store.get("keyboard", {}));
  mission ??= makeKeyMission();
  shop();
}

function missionCard() {
  const m = mission;
  const done = missionDone(keyboard, m);
  const card = ui.h("div", { class: `card mission${done ? " done" : ""}` },
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
  return card;
}

function caseEl(rows) {
  return ui.h("div", { class: lights ? "kb rgb" : "kb" },
    ui.h("span", { class: "screw tl" }), ui.h("span", { class: "screw tr" }),
    ui.h("span", { class: "screw bl" }), ui.h("span", { class: "screw br" }),
    ui.h("div", { class: "plate" }, rows));
}

function shop() {
  let busy = false;
  const keys = {};
  const bench = ui.h("div", { class: "bench" });
  const mCard = missionCard();
  const board = caseEl(KEY_ROWS.map((row) => ui.h("div", { class: "kb-row" }, [...row].map((l) => {
    keys[l] = keycap(l, keyboard[l], { onclick: () => !busy && pull(l) });
    if (!keyMeetsMission(keyboard[l], mission) && mission.letters.includes(l)) keys[l].classList.add("target");
    return keys[l];
  }))));

  const idle = () => bench.replaceChildren(
    ui.h("div", { class: "bench-hint" }, "🔧 Tap a key to pull it off!"),
    ui.h("div", { class: "tools" },
      ui.h("button", { class: `tool${lights ? " on" : ""}`, onclick: () => { lights = !lights; board.classList.toggle("rgb", lights); sfx.thock(); idle(); } }, lights ? "💡 Lights on" : "💡 Lights"),
      ui.h("button", { class: "tool", onclick: () => !busy && popAll(keys) }, "🫧 Pop them all!")));

  async function pull(l) {
    busy = true;
    const k = keys[l];
    const tool = puller();
    board.append(tool);
    const x = k.offsetLeft + k.offsetWidth / 2 - 30;
    tool.style.left = `${x}px`;
    tool.style.top = `${k.offsetTop - 62}px`;
    await anim(tool, [{ transform: "translateY(-50px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], 260);
    sfx.pop();
    ui.say(l);
    const ghost = k.cloneNode(true);
    ghost.classList.add("ghost");
    ghost.style.left = `${k.offsetLeft}px`;
    ghost.style.top = `${k.offsetTop}px`;
    ghost.style.width = `${k.offsetWidth}px`;
    ghost.style.height = `${k.offsetHeight}px`;
    board.append(ghost);
    k.replaceChildren(withStem(switchEl(), l));
    k.classList.add("bare");
    await Promise.all([
      anim(tool, [{ transform: "translateY(0)" }, { transform: "translateY(-70px)", opacity: 0 }], 380, "cubic-bezier(.3,1.6,.6,1)"),
      anim(ghost, [{ transform: "translateY(0) rotate(0)" }, { transform: "translateY(-70px) rotate(-12deg)", opacity: 0 }], 380, "cubic-bezier(.3,1.6,.6,1)"),
    ]);
    tool.remove();
    ghost.remove();
    studio(l, async (newKey) => {
      if (newKey) { keyboard[l] = newKey; save(); }
      const fresh = keycap(l, keyboard[l], { onclick: () => !busy && pull(l) });
      k.replaceWith(fresh);
      keys[l] = fresh;
      fresh.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
      await wait(250);
      await anim(fresh, [{ transform: "translateY(-60px) scale(1.15)", opacity: 0 }, { transform: "translateY(4px)", opacity: 1, offset: 0.8 }, { transform: "translateY(0)", opacity: 1 }], 320, "ease-in");
      sfx.snap();
      busy = false;
      if (!newKey) { shop(); return; }
      const wasDone = mCard.classList.contains("done");
      const nowDone = missionDone(keyboard, mission);
      if (nowDone && !wasDone) ui.celebrate("Mission done!");
      else ui.say(`${newKey.f === "solid" ? "" : finishLabel(newKey.f)} ${l}! ${keyLine(l)}`);
      setTimeout(shop, nowDone && !wasDone ? 900 : 700);
    });
  }

  function studio(l, done) {
    const paints = PAINTS.some((p) => p.color === mission.color) || !mission.color ? PAINTS : [{ name: mission.colorName, color: mission.color }, ...PAINTS];
    const start = keyboard[l] ?? { c: paints[0].color, f: "solid" };
    let brush = { c: paints.some((p) => p.color === start.c) ? start.c : paints[0].color, f: start.f };
    let painted = 0;
    let finished = false;

    const S = 180;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cv = ui.h("canvas", { class: "paint-canvas", width: S * dpr, height: S * dpr });
    const g = cv.getContext("2d", { willReadFrequently: true });
    let pattern;
    const makePattern = () => {
      const off = document.createElement("canvas");
      off.width = off.height = S * dpr;
      drawFinish(off.getContext("2d"), S * dpr, brush);
      pattern = g.createPattern(off, "no-repeat");
    };
    makePattern();

    const big = keycap(l, keyboard[l], { tabindex: "-1" });
    big.classList.add("big");
    big.querySelector(".kc-top").prepend(cv);
    const meter = ui.h("div", { class: "meter" }, ui.h("span"));
    const finishBtn = ui.h("button", { class: "next finish-btn", hidden: true, onclick: () => complete() }, "✨ Finish it!");

    const coverage = () => {
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let hit = 0, all = 0;
      const step = 6 * dpr;
      for (let y = step / 2; y < cv.height; y += step) {
        for (let x = step / 2; x < cv.width; x += step) {
          all++;
          if (d[(Math.floor(y) * cv.width + Math.floor(x)) * 4 + 3] > 40) hit++;
        }
      }
      return hit / all;
    };
    const updateMeter = () => {
      painted = coverage();
      meter.firstChild.style.width = `${Math.round(painted * 100)}%`;
      finishBtn.hidden = painted < 0.3;
      if (painted >= 0.8) complete();
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

    let last = null, lastT = 0, moves = 0;
    cv.addEventListener("pointerdown", (e) => {
      if (finished) return;
      cv.setPointerCapture(e.pointerId);
      last = local(e);
      lastT = e.timeStamp;
      splat(...last);
      swishStart();
      swishSpeed(0.6);
      updateMeter();
    });
    cv.addEventListener("pointermove", (e) => {
      if (!last || finished) return;
      const p = local(e);
      stroke(...last, ...p);
      const dt = Math.max(1, e.timeStamp - lastT);
      swishSpeed(Math.hypot(p[0] - last[0], p[1] - last[1]) / dpr / dt);
      last = p;
      lastT = e.timeStamp;
      if (++moves % 5 === 0) updateMeter();
    });
    const lift = () => { if (!last) return; last = null; swishStop(); if (!finished) updateMeter(); };
    cv.addEventListener("pointerup", lift);
    cv.addEventListener("pointercancel", lift);

    async function complete() {
      if (finished) return;
      finished = true;
      swishStop();
      const cx = cv.width / 2;
      const t0 = performance.now();
      await new Promise((resolve) => {
        const grow = (now) => {
          const t = reduced() ? 1 : Math.min(1, Math.max(0.01, (now - t0) / 380));
          g.fillStyle = pattern;
          g.beginPath(); g.arc(cx, cx, cx * 1.5 * t, 0, Math.PI * 2); g.fill();
          t < 1 ? requestAnimationFrame(grow) : resolve();
        };
        requestAnimationFrame(grow);
      });
      meter.firstChild.style.width = "100%";
      big.classList.add("shine");
      sfx.sparkle();
      sparkles(big);
      await wait(1000);
      done({ ...brush });
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

    bench.replaceChildren(
      ui.h("div", { class: "mat" },
        big,
        ui.h("div", { class: "bench-hint" }, "🖌️ Rub the key to paint it!"),
        meter),
      ui.h("div", { class: "picker-label" }, "🎨 Paint"),
      potRow,
      ui.h("div", { class: "picker-label" }, "✨ Style"),
      finishRow,
      finishBtn,
      ui.h("button", { class: "tool back", onclick: () => { if (!finished) { finished = true; swishStop(); done(null); } } }, "↩️ Put it back"));
    bench.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
  }

  idle();
  ui.screen("Key Shop ⌨️", mCard, board, bench);
  if (!missionDone(keyboard, mission)) ui.say(mission.text);
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

// ---------- pop them all: keys scatter, he puts them back A to Z ----------
async function popAll(keys) {
  const letters = Object.keys(keys);
  for (const [i, l] of letters.entries()) {
    const k = keys[l];
    setTimeout(() => {
      sfx.pop();
      const dx = (Math.random() - 0.5) * 260, dr = (Math.random() - 0.5) * 720;
      anim(k, [{ transform: "none" }, { transform: `translate(${dx}px, -120px) rotate(${dr / 2}deg)`, offset: 0.4 }, { transform: `translate(${dx * 1.4}px, 420px) rotate(${dr}deg)`, opacity: 0 }], 900, "cubic-bezier(.2,.6,.6,1)");
    }, reduced() ? 0 : i * 55);
  }
  await wait(letters.length * 55 + 800);
  rebuild(shuffle(letters));
}

function rebuild(tray) {
  const order = [...KEY_ROWS.join("")].sort();
  let next = 0;
  const slots = {};
  const prompt = ui.h("div", { class: "prompt" });
  const ask = () => { prompt.textContent = `Find ${order[next]}!`; };
  const board = caseEl(KEY_ROWS.map((row) => ui.h("div", { class: "kb-row" }, [...row].map((l) => {
    slots[l] = ui.h("div", { class: "kc bare" }, withStem(switchEl(), l));
    return slots[l];
  }))));

  const trayEl = ui.h("div", { class: "tray" }, tray.map((l) => {
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
        const placed = keycap(l, keyboard[l], { onclick: () => ui.speak(keyLine(l)) });
        slots[l].replaceWith(placed);
        slots[l] = placed;
        next += 1;
        anim(placed, [{ transform: "translateY(-50px) scale(1.2)", opacity: 0 }, { transform: "translateY(3px)", opacity: 1, offset: 0.8 }, { transform: "none", opacity: 1 }], 260, "ease-in")
          .then(() => sfx.snap());
        if (next === order.length) {
          prompt.textContent = "All fixed! 🎉";
          await wait(300);
          ui.celebrate("You put the whole keyboard back together!");
          board.classList.add("rgb");
          trayEl.replaceWith(ui.h("button", { class: "next", onclick: shop }, "Back to the shop ⌨️"));
        } else {
          ask();
          ui.say(`${l}! Now find ${order[next]}!`);
        }
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
    board,
    trayEl);
  ui.say(`Uh oh, all the keys popped off! Let's put them back. Find ${order[0]}!`);
}
