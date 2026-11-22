import { STATES } from "./data.js";
import { makeSpotRound, spotTap, spotPrompt, spotMissLine, spotDoneLine } from "./spotter-logic.js";

const CSS = `
.spot-head { display: flex; align-items: center; gap: 12px; text-align: left; margin-bottom: 8px; }
.spot-text { flex: 1; min-width: 0; }
.spot-head .prompt { margin: 0; }
.spot-glyph { flex: 0 0 auto; min-width: 60px; font-size: 3rem; font-weight: 900; line-height: 1; text-align: center; }
.spot-dots { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; font-size: 1.15rem; }
.spot-dots span { filter: grayscale(1); opacity: .35; transition: .3s; }
.spot-dots span.got { filter: none; opacity: 1; }
.us-state.spot-miss { fill: #5a2a38 !important; }
.us-chip.spot-miss { background: #5a2a38 !important; }
`;

const TABS = [["state", "📍 Find it"], ["letter", "🔤 Letters"], ["store", "🛒 Stores"]];
const TITLE = "State Spotter 📍";
const HINT_AFTER = 3;
let mode = "state";
let ui;

const nameOf = (c) => STATES[c];

function addStyle() {
  if (document.getElementById("spotter-css")) return;
  document.head.append(Object.assign(document.createElement("style"), { id: "spotter-css", textContent: CSS }));
}

export function spotter(kit) {
  ui = kit;
  addStyle();
  play(makeSpotRound(Math.random, mode));
}

function play(round) {
  const { h, screen, say, speak, celebrate, boop, tone, stateMap, brandText, COLORS } = ui;
  const found = new Set();
  let misses = 0;
  let missed = null;
  let hint = null;
  const color = round.type === "store" ? round.store.color : "var(--green)";
  const prompt = spotPrompt(round);

  const glyph = round.type === "letter"
    ? h("div", { class: "spot-glyph", style: { color: COLORS[round.letter.charCodeAt(0) % COLORS.length] } }, round.letter)
    : h("div", { class: "spot-glyph" }, round.type === "store" ? round.store.emoji : "📍");
  const dots = round.targets.length > 1
    ? h("div", { class: "spot-dots", "aria-label": `0 of ${round.targets.length} found` }, round.targets.map(() => h("span", {}, "📍")))
    : null;
  const mapBox = h("div");
  const result = h("div");

  const drawMap = () => mapBox.replaceChildren(stateMap((c) => (found.has(c) ? color : null), {
    ring: hint,
    mark: (c) => (c === missed ? "spot-miss" : ""),
    onTap: tap,
  }));

  function tap(code) {
    if (found.size === round.targets.length) { speak(nameOf(code)); return; }
    const what = spotTap(round, found, code);
    if (what === "again") { speak(`${nameOf(code)}! You found that one.`); return; }
    if (what === "miss") {
      misses += 1;
      missed = code;
      boop();
      if (misses >= HINT_AFTER && !hint) hint = round.targets.find((c) => !found.has(c));
      drawMap();
      say(hint && misses === HINT_AFTER ? `${spotMissLine(round, code)} Look for the white outline!` : spotMissLine(round, code));
      return;
    }
    found.add(code);
    missed = null;
    misses = 0;
    if (hint === code) hint = null;
    drawMap();
    if (dots) {
      dots.children[found.size - 1].classList.add("got");
      dots.setAttribute("aria-label", `${found.size} of ${round.targets.length} found`);
    }
    if (found.size < round.targets.length) {
      tone([660, 990], "sine", 0.08);
      say(`${nameOf(code)}! ${round.targets.length - found.size} more!`);
      return;
    }
    celebrate(spotDoneLine(round));
    result.replaceChildren(h("button", { class: "next", onclick: () => play(makeSpotRound(Math.random, mode)) }, "🔁 New one"));
    requestAnimationFrame(() => result.scrollIntoView({ behavior: "smooth", block: "end" }));
  }

  drawMap();
  screen(TITLE,
    h("div", { class: "tabs" }, TABS.map(([k, lbl]) =>
      h("button", { class: mode === k ? "on" : "", onclick: () => { mode = k; play(makeSpotRound(Math.random, mode)); } }, lbl))),
    h("div", { class: "card compact" },
      h("div", { class: "spot-head" },
        glyph,
        h("div", { class: "spot-text" },
          h("div", { class: "prompt" }, round.type === "store"
            ? ["Light up every ", h("span", { style: brandText(round.store.color) }, round.store.name), " state!"]
            : prompt),
          dots),
        h("button", { class: "say round", "aria-label": "Hear it", onclick: () => speak(prompt) }, "🔊")),
      mapBox),
    result);
  say(prompt);
}
