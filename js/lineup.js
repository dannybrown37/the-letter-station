import { CATEGORY_INFO } from "./data.js";
import { makeLineUp, lineUpHint, LINEUP_SIZE } from "./lineup-logic.js";

const CSS = `
.lu-head { display: flex; align-items: center; gap: 12px; text-align: left; }
.lu-head > .lu-text { flex: 1; min-width: 0; }
.lu-head .prompt { margin: 0; }
.lu-train { display: grid; gap: 8px; margin: 14px 0; }
.lu-engine { flex: 0 0 auto; font-size: 2.4rem; line-height: 1; }
.lu-car {
  display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 6px 12px;
  border-radius: 16px; border: 3px dashed var(--line); background: var(--panel);
  font-size: 1.25rem; font-weight: 900; text-align: left;
}
.lu-car b { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  background: var(--card); color: var(--muted); font-size: 1rem; }
.lu-car.full { border-style: solid; border-color: var(--c); background: color-mix(in srgb, var(--c) 22%, var(--panel));
  animation: pop-in .35s cubic-bezier(.3, 1.6, .5, 1); }
.lu-car.full b { background: var(--c); color: #fff; }
.lu-words { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lu-word { min-height: 72px; padding: 8px 6px; border-radius: 18px; background: var(--card); color: var(--ink);
  font-size: 1.2rem; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
.lu-word i { font-style: normal; color: var(--yellow); text-decoration: underline; text-underline-offset: 3px; }
.lu-word.used { visibility: hidden; }
.lu-word.nope { animation: shake .4s; }
`;

const TABS = [[false, "🔤 ABC"], [true, "🧐 Tricky"]];
const TITLE = "ABC Line Up 🔠";
const COLORS = ["#ff5ca8", "#3fa9f5", "#36c275", "#ff8a3d"];
let tricky = false;
let ui;

function addStyle() {
  if (document.getElementById("lineup-css")) return;
  document.head.append(Object.assign(document.createElement("style"), { id: "lineup-css", textContent: CSS }));
}

// Underline the letter that decides the order: the first one, or the second on Tricky.
function marked(h, word, nth) {
  let seen = -1;
  const i = [...word].findIndex((ch) => /[a-z0-9]/i.test(ch) && ++seen === nth);
  return i < 0 ? word : [word.slice(0, i), h("i", {}, word[i]), word.slice(i + 1)];
}

export function lineUp(kit) {
  ui = kit;
  addStyle();
  play();
}

function play() {
  const { h, screen, say, speak, celebrate, boop, tone } = ui;
  const round = makeLineUp(Math.random, { tricky });
  const info = CATEGORY_INFO[round.category];
  const prompt = tricky
    ? `These all start with ${round.letter}. Put them in A B C order!`
    : "Put them in A B C order!";
  let placed = 0;
  let misses = 0;
  const cars = round.order.map((_, i) => h("div", { class: "lu-car", style: { "--c": COLORS[i] } }, h("b", {}, String(i + 1))));
  const result = h("div");

  const words = h("div", { class: "lu-words" }, round.words.map((w) => {
    const b = h("button", {
      class: "lu-word",
      onclick: () => {
        if (b.classList.contains("used") || placed === LINEUP_SIZE) return;
        if (w !== round.order[placed]) {
          misses += 1;
          b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope");
          boop();
          say(misses >= 2 ? lineUpHint(round, placed) : `Not ${w} yet. ${lineUpHint(round, placed)}`);
          return;
        }
        misses = 0;
        b.classList.add("used");
        cars[placed].classList.add("full");
        cars[placed].append(w);
        placed += 1;
        if (placed < LINEUP_SIZE) { tone([520 + placed * 130], "sine", 0.12); say(w); return; }
        celebrate(`${round.order.join(", ")}. That's A B C order!`);
        words.remove();
        result.replaceChildren(
          h("button", { class: "say", onclick: () => speak(round.order.join(", ")) }, "🔊 Hear the line"),
          h("button", { class: "next", onclick: play }, "Next ➡️"));
        requestAnimationFrame(() => result.scrollIntoView({ behavior: "smooth", block: "end" }));
      },
    }, marked(h, w, tricky ? 1 : 0));
    return b;
  }));

  screen(TITLE,
    h("div", { class: "tabs" }, TABS.map(([k, lbl]) =>
      h("button", { class: tricky === k ? "on" : "", onclick: () => { tricky = k; play(); } }, lbl))),
    h("div", { class: "card compact" },
      h("div", { class: "lu-head" },
        h("div", { class: "lu-engine", "aria-hidden": "true" }, "🚂"),
        h("div", { class: "lu-text" },
          h("div", { class: "prompt" }, "Line them up A\u00a0to\u00a0Z"),
          h("div", { class: "sub" }, `${info.emoji} ${info.label}${tricky ? ` · all start with ${round.letter}` : ""}`)),
        h("button", { class: "say round", "aria-label": "Hear it", onclick: () => speak(prompt) }, "🔊")),
      h("div", { class: "lu-train" }, cars)),
    words,
    result);
  say(prompt);
}
