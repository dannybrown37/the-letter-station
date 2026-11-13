import { BIG_NUMBERS, STATE_TILES, STATES, STORES, KINDS, CATEGORY_INFO, VIDEO_QUESTIONS, VIDEO_CHANNELS, SING_VIDEOS, LBB_CHARACTERS, SING_CHARACTERS, LEARNING_STATION_CHARACTERS } from "./data.js";
import {
  ALPHABET, pick, shuffle, wordsForLetter, makeLetterQuestion,
  makeStoreQuestion, makeYesNoQuestion, storesInState, parseYouTubeId,
  checkLetterAnswer, firstLetter, isDeadThumb, mergeVideos, makeCharacterQuestion, makeMixedCharacterQuestion,
  bigNumberText, makeBigNumberQuestion, makeBalloonRound,
} from "./logic.js";
import { keyShop } from "./keyshop.js";

const byName = (a, b) => a.name.localeCompare(b.name);
const STORES_AZ = [...STORES].sort(byName);

// The Key Shop studio has a landscape layout; every other game stays portrait.
const canTurn = () => location.hash === "#keyShop";

// iOS has no orientation lock; CSS turns the page back, this says which way the phone went.
function trackTurn() {
  screen.orientation?.lock?.(canTurn() ? "any" : "portrait").catch(() => {});
  const angle = window.orientation ?? screen.orientation?.angle;
  const turn = canTurn() ? null : angle === 90 ? "left" : angle === -90 || angle === 270 ? "right" : null;
  if (turn) document.documentElement.dataset.turn = turn;
  else delete document.documentElement.dataset.turn;
}
trackTurn();
addEventListener("orientationchange", trackTurn);
addEventListener("resize", trackTurn);

const app = document.getElementById("app");
const titleEl = document.getElementById("title");
const COLORS = ["#ff5ca8", "#3fa9f5", "#36c275", "#ff8a3d", "#8f6bff", "#ffb800", "#00b8a9"];
// Brand colors are often dark (Trader Joe's red); lighten them so they read on the dark theme.
const brandText = (color) => ({ color: `color-mix(in srgb, ${color} 60%, white)` });
const CHEERS = ["Great job!", "You got it!", "Awesome!", "Super smart!", "Way to go!", "Yes! Amazing!", "High five!"];

// ---------- tiny DOM helper (textContent only, so saved video titles can't inject HTML) ----------
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") for (const [p, val] of Object.entries(v)) p.startsWith("--") ? el.style.setProperty(p, val) : (el.style[p] = val);
    else if (k === "class") el.className = v;
    else if (v !== false) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}

// ---------- stars ----------
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
let stars = store.get("stars", 0);
const starEl = document.getElementById("star-count");
starEl.textContent = stars;
function addStar() {
  stars += 1;
  store.set("stars", stars);
  starEl.textContent = stars;
  starEl.parentElement.classList.remove("bump");
  void starEl.offsetWidth;
  starEl.parentElement.classList.add("bump");
  if (stars % 10 === 0) { confetti(40); say(`Wow! ${stars} stars!`); }
}

// ---------- speech + sounds ----------
let narration = store.get("narration", true);
const narrationBtn = document.getElementById("narration-btn");
function showNarration() {
  narrationBtn.textContent = narration ? "🔊" : "🔇";
  narrationBtn.setAttribute("aria-label", narration ? "Talking on" : "Talking off");
  narrationBtn.setAttribute("aria-pressed", String(narration));
}
narrationBtn.addEventListener("click", () => {
  narration = !narration;
  store.set("narration", narration);
  showNarration();
  if (narration) say("Talking is on!");
  else window.speechSynthesis?.cancel();
});
showNarration();

// say() is automatic narration and obeys the toggle; speak() is for taps that ask to hear something.
function say(text) {
  if (narration) speak(text);
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/&/g, " and "));
  u.rate = 0.95;
  u.pitch = 1.15;
  speechSynthesis.speak(u);
}

let audio;
function tone(freqs, type = "sine", step = 0.11) {
  try {
    audio ??= new AudioContext();
    freqs.forEach((f, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const t = audio.currentTime + i * step;
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + step * 1.8);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + step * 2);
    });
  } catch { /* audio is a bonus */ }
}
const ding = () => tone([523, 659, 784, 1047]);
const boop = () => tone([300, 220], "triangle", 0.15);

function confetti(n = 18) {
  const box = document.getElementById("confetti");
  const bits = ["⭐", "🎉", "🔤", "🛒", "🍔", "🎈", "✨", "🅰️", "🅱️"];
  for (let i = 0; i < n; i++) {
    const s = h("span", { style: { left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 0.4}s` } }, pick(bits));
    box.append(s);
    setTimeout(() => s.remove(), 2200);
  }
}

function celebrate(extra = "") {
  ding();
  confetti();
  addStar();
  say(`${pick(CHEERS)} ${extra}`);
}

// ---------- shared quiz pieces ----------
let streak = 0;
const streakLine = () => h("div", { class: "streak" }, streak >= 2 ? `🔥 ${streak} in a row!` : "");

function sayButton(text) {
  return h("button", { class: "say", onclick: () => speak(text) }, "🔊 Hear it");
}

// Wrong taps never end the round — he keeps trying until he finds it.
function choiceButtons(choices, { label = (c) => c, isRight, onRight, rightLine, cols = 1 }) {
  let done = false;
  const wrap = h("div", { class: cols === 2 ? "choices two" : "choices" });
  for (const c of choices) {
    const b = h("button", {
      class: "choice",
      onclick: () => {
        if (done || b.classList.contains("wrong")) return;
        if (isRight(c)) {
          done = true;
          b.classList.add("right");
          streak += 1;
          celebrate(rightLine(c));
          onRight();
        } else {
          streak = 0;
          b.classList.add("wrong");
          boop();
          say(`Not ${label(c)}. Try again!`);
        }
      },
    }, label(c));
    wrap.append(b);
  }
  return wrap;
}

function nextButton(fn) {
  return h("button", { class: "next", onclick: fn }, "Next ➡️");
}

// iOS scrolls the page up when the keyboard opens; compact the layout and keep it pinned to the top instead.
const isTyping = () => document.activeElement?.classList.contains("answer");
document.addEventListener("focusin", () => document.documentElement.classList.toggle("typing", isTyping()));
document.addEventListener("focusout", () => setTimeout(() => document.documentElement.classList.toggle("typing", isTyping())));
window.visualViewport?.addEventListener("resize", () => { if (isTyping()) window.scrollTo(0, 0); });
window.visualViewport?.addEventListener("scroll", () => { if (isTyping() && window.scrollY) window.scrollTo(0, 0); });

function screen(title, ...kids) {
  titleEl.textContent = title;
  app.replaceChildren(...kids.flat());
  window.scrollTo(0, 0);
}

// ---------- screens ----------
const GAMES = [
  { id: "storeHunt", label: "Store Hunt", emoji: "🛒", color: "#2fb36a", run: storeHunt },
  { id: "yesNo", label: "Yes or No?", emoji: "🤔", color: "#ff8a3d", run: yesNo },
  { id: "storeFinder", label: "Where Is It?", emoji: "🗺️", color: "#ff5ca8", run: storeFinder },
  { id: "letterPop", label: "Letter Pop", emoji: "🎈", color: "#e94b6a", run: letterPop },
  { id: "letterTrain", label: "Letter Train", emoji: "🚂", color: "#3fa9f5", run: letterTrain },
  { id: "letterExplorer", label: "ABC Explorer", emoji: "🔤", color: "#8f6bff", run: letterExplorer },
  { id: "friends", label: "Friends", emoji: "⭐", color: "#00a99b", run: () => friendsScreen() },
  { id: "guessWho", label: "Guess Who?", emoji: "❓", color: "#d9534f", run: guessWho },
  { id: "bigNumbers", label: "Big Numbers", emoji: "🔢", color: "#6f5bd9", run: bigNumbers },
  { id: "keyShop", label: "Key Shop", emoji: "⌨️", color: "#d6408f", run: () => keyShop({ h, screen, say, speak, celebrate, store, audio: () => (audio ??= new AudioContext()) }) },
  { id: "videoStation", label: "Videos", emoji: "📺", color: "#e8a200", run: videoStation },
  { id: "surprise", label: "Surprise!", emoji: "🎁", color: "#4a3f8c", run: () => { location.replace("#" + pick(GAMES.filter((g) => g.id !== "surprise" && g.id !== "videoStation")).id); } },
];

function home() {
  screen("The Letter Station",
    h("div", { class: "hello" },
      h("span", { class: "wave" }, "👋"),
      h("div", {}, h("div", { class: "hello-title" }, "Hi, friend!"), h("div", { class: "sub" }, "What do you want to play?"))),
    h("div", { class: "tiles" },
      GAMES.map((g, i) => h("button", {
        class: "tile",
        style: { "--c": g.color, "--i": i },
        onclick: () => { say(g.label); location.hash = g.id; },
      }, h("span", { class: "big" }, g.emoji), h("span", {}, g.label)))));
}

// Tile map of the US. paint(code) returns a color to light that state, or null.
function stateMap(paint, { onTap, ring } = {}) {
  return h("div", { class: "us-map", role: "group", "aria-label": "Map of the states" },
    Object.entries(STATE_TILES).map(([code, [col, row]]) => {
      const color = paint(code);
      return h("button", {
        class: `us-tile${color ? " on" : ""}${code === ring ? " ring" : ""}`,
        "aria-label": STATES[code],
        style: { gridColumn: col + 1, gridRow: row + 1, background: color ?? "", transitionDelay: `${(col + row) * 30}ms` },
        onclick: () => onTap?.(code),
      }, code);
    }));
}

const strip = (kids, cls = "") => {
  const el = h("div", { class: `strip ${cls}` }, kids);
  requestAnimationFrame(() => el.querySelector(".on")?.scrollIntoView({ inline: "center", block: "nearest" }));
  return el;
};

// ---------- store pictures (Wikipedia, cached on the device, emoji if none) ----------
const IMG_CACHE_KEY = "storeImages";
const imgCache = store.get(IMG_CACHE_KEY, {});

async function storeImageUrl(s) {
  if (s.wiki in imgCache) return imgCache[s.wiki];
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(s.wiki)}`);
  if (!res.ok) return "";
  const data = await res.json();
  imgCache[s.wiki] = data.thumbnail?.source ?? "";
  store.set(IMG_CACHE_KEY, imgCache);
  return imgCache[s.wiki];
}

function storePicture(s) {
  const box = h("div", { class: "store-pic" }, h("span", { class: "giant" }, s.emoji));
  storeImageUrl(s).then((src) => {
    if (!src) return;
    const img = h("img", { src, alt: `${s.name} store`, onload: () => box.replaceChildren(img) });
  }).catch(() => {});
  return box;
}

const kindLine = (s) => `${s.name} is a ${KINDS[s.kind].label.toLowerCase()}, ${KINDS[s.kind].blurb}.`;

function kindBadge(s) {
  const k = KINDS[s.kind];
  return h("button", { class: "kind", onclick: () => speak(kindLine(s)) }, `${k.emoji} ${k.label}`);
}

function storeHeader(s, ...extra) {
  return h("div", { class: "store-row" },
    storePicture(s),
    h("div", {}, h("div", { class: "store-name", style: brandText(s.color) }, s.name), kindBadge(s), ...extra));
}

const article = (word) => (/^[AEIOU]/i.test(word) ? "an" : "a");
const aOrAn = (word) => `${article(word)} ${word}`;

// Big chains read better as "every state except ..." than a wall of 47 chips.
function footprint(s, highlight) {
  const missing = Object.keys(STATES).filter((c) => !s.states.includes(c));
  if (missing.length === 0) return h("div", { class: "prompt", style: brandText(s.color) }, `${s.name} is in all 50 states! 🎉`);
  const line = s.states.length > 25
    ? `${s.name} is in ${s.states.length} states. Not in ${listWords(missing.map((c) => STATES[c]))}.`
    : `${s.name} is in ${listWords(s.states.map((c) => STATES[c]))}.`;
  return [
    h("button", { class: "sub map-line", onclick: () => speak(line) }, `${s.name} is in ${s.states.length} state${s.states.length > 1 ? "s" : ""} 🔊`),
    stateMap((c) => (s.states.includes(c) ? s.color : null), { ring: highlight, onTap: (c) => speak(hasLine(s, c)) }),
  ];
}

const hasLine = (s, c) => (s.states.includes(c) ? `Yes! ${STATES[c]} has ${s.name}` : `No, ${STATES[c]} doesn't have ${s.name}`);

function showResult(result, ...kids) {
  result.replaceChildren(...kids);
  requestAnimationFrame(() => result.scrollIntoView({ behavior: "smooth", block: "end" }));
}

function storeHunt() {
  const q = makeStoreQuestion();
  const name = q.store.name;
  const verb = q.has ? "has" : "does NOT have";
  const prompt = `Which state ${q.has ? "has" : "does not have"} ${aOrAn(name)}?`;
  const result = h("div");
  screen("Store Hunt 🛒",
    h("div", { class: "card", style: { borderTop: `10px solid ${q.store.color}` } },
      storeHeader(q.store),
      h("div", { class: "prompt" }, `Which state ${verb} ${article(name)} `,
        h("span", { style: brandText(q.store.color) }, name), "?"),
      sayButton(prompt),
      streakLine()),
    choiceButtons(q.choices, {
      cols: 2,
      label: (c) => STATES[c],
      isRight: (c) => q.store.states.includes(c) === q.has,
      rightLine: (c) => (q.has ? `${STATES[c]} has ${aOrAn(name)}!` : `${STATES[c]} doesn't have ${aOrAn(name)}!`),
      onRight: () => showResult(result, h("div", { class: "card" }, footprint(q.store, q.answer)), nextButton(storeHunt)),
    }),
    result);
  say(`${kindLine(q.store)} ${prompt}`);
}

function yesNo() {
  const q = makeYesNoQuestion();
  const stateName = STATES[q.state];
  const prompt = `Does ${stateName} have ${aOrAn(q.store.name)}?`;
  const result = h("div");
  screen("Yes or No? 🤔",
    h("div", { class: "card" },
      storeHeader(q.store),
      h("div", { class: "prompt" }, "Does ", h("span", { style: { color: "#3fa9f5" } }, stateName),
        ` have ${article(q.store.name)} `, h("span", { style: brandText(q.store.color) }, q.store.name), "?"),
      sayButton(prompt),
      streakLine()),
    (() => {
      const btns = choiceButtons([true, false], {
        cols: 2,
        label: (c) => (c ? "YES 👍" : "NO 👎"),
        isRight: (c) => c === q.answer,
        rightLine: () => (q.answer ? `${stateName} has ${aOrAn(q.store.name)}!` : `There is no ${q.store.name} in ${stateName}.`),
        onRight: () => showResult(result, h("div", { class: "card" }, footprint(q.store, q.state)), nextButton(yesNo)),
      });
      btns.children[0].classList.add("yes");
      btns.children[1].classList.add("no");
      return btns;
    })(),
    result);
  say(`${kindLine(q.store)} ${prompt}`);
}

let trainSettings = { category: null, letter: null };
function letterTrain() {
  const q = makeLetterQuestion(Math.random, {
    category: trainSettings.category ?? undefined,
    letter: trainSettings.letter && trainSettings.category ? trainSettings.letter : undefined,
  });
  const info = CATEGORY_INFO[q.category];
  const kind = info.label.toLowerCase().replace(/s$/, "");
  const prompt = `Which ${kind} starts with the letter ${q.letter}?`;
  const { form, input } = typedAnswerForm(q, kind);
  screen("Letter Train 🚂",
    h("div", { class: "tabs" },
      [[null, "🎲 Mix"], ...Object.entries(CATEGORY_INFO).map(([k, v]) => [k, v.emoji])].map(([k, lbl]) =>
        h("button", {
          class: trainSettings.category === k ? "on" : "",
          "aria-label": k ? CATEGORY_INFO[k].label : "Mix",
          onclick: () => { trainSettings = { category: k, letter: null }; if (k) say(CATEGORY_INFO[k].label); letterTrain(); },
        }, lbl))),
    h("div", { class: "card" },
      h("div", { class: "giant", style: { color: pick(COLORS) } }, `${q.letter}${q.letter.toLowerCase()}`),
      h("div", { class: "prompt" }, `Which ${info.emoji} ${kind} starts with ${q.letter}?`),
      sayButton(prompt),
      streakLine()),
    form);
  say(prompt);
  input.focus();
}

function typedAnswerForm(q, kind) {
  const input = h("input", {
    class: "answer", type: "text", autocomplete: "off", autocapitalize: "words", spellcheck: "false",
    "aria-label": "Your answer", placeholder: `Type a ${kind}...`,
  });
  const hint = h("div", { class: "sub hint" });
  const submit = h("button", { class: "next", type: "submit" }, "Check ✅");
  let done = false;
  let misses = 0;
  const form = h("form", {
    class: "answer-form",
    onsubmit: (e) => {
      e.preventDefault();
      if (done) { letterTrain(); return; }
      const { status, word } = checkLetterAnswer(input.value, q.letter, q.category);
      if (status === "empty") return;
      if (status === "right") {
        done = true;
        input.value = word;
        input.readOnly = true;
        input.classList.add("right");
        submit.textContent = "Next ➡️";
        hint.textContent = "";
        streak += 1;
        celebrate(`${word} starts with ${q.letter}!`);
        return;
      }
      streak = 0;
      misses += 1;
      boop();
      const line = status === "wrongLetter"
        ? `That starts with ${firstLetter(input.value)}. We need ${q.letter}! Try again!`
        : `Hmm, I don't know that ${kind}. Try another!`;
      hint.textContent = misses >= 3 ? `${line} Hint: ${q.answer}` : line;
      say(hint.textContent);
      input.select();
    },
  }, input, submit, hint);
  return { form, input };
}

function letterExplorer(letter) {
  if (!letter) {
    screen("ABC Explorer 🔤",
      h("div", { class: "card" }, h("div", { class: "prompt" }, "Pick a letter!")),
      h("div", { class: "letters" }, ALPHABET.map((l, i) =>
        h("button", { class: "letter", style: { backgroundColor: COLORS[i % COLORS.length] }, onclick: () => letterExplorer(l) }, l))));
    say("Pick a letter!");
    return;
  }
  const idx = ALPHABET.indexOf(letter);
  const prev = ALPHABET[(idx + 25) % 26];
  const next = ALPHABET[(idx + 1) % 26];
  const counts = Object.fromEntries(Object.keys(CATEGORY_INFO).map((c) => [c, wordsForLetter(letter, c).length]));
  if (!counts[explorerCat]) explorerCat = Object.keys(counts).find((c) => counts[c]) ?? explorerCat;
  const info = CATEGORY_INFO[explorerCat];
  const words = wordsForLetter(letter, explorerCat);
  screen(`Letter ${letter}`,
    h("div", { class: "card compact letter-head" },
      h("button", { class: "choice", "aria-label": `Letter ${prev}`, onclick: () => letterExplorer(prev) }, `⬅️ ${prev}`),
      h("button", { class: "giant letter-big", style: { color: COLORS[idx % COLORS.length] }, onclick: () => speak(letter) }, `${letter}${letter.toLowerCase()}`),
      h("button", { class: "choice", "aria-label": `Letter ${next}`, onclick: () => letterExplorer(next) }, `${next} ➡️`)),
    h("div", { class: "tabs" }, Object.entries(CATEGORY_INFO).map(([cat, ci]) =>
      h("button", {
        class: cat === explorerCat ? "on" : "",
        "aria-label": ci.label,
        disabled: !counts[cat],
        onclick: () => { explorerCat = cat; say(ci.label); letterExplorer(letter); },
      }, ci.emoji, h("small", { class: "count" }, String(counts[cat]))))),
    h("div", { class: "card" },
      h("div", { class: "prompt" }, `${info.emoji} ${info.label} with ${letter}`),
      h("div", { class: "chips" }, words.map((w, i) =>
        h("button", { class: "chip", onclick: () => speak(w), style: { borderBottom: `4px solid ${COLORS[i % COLORS.length]}` } }, w)))),
    h("button", { class: "next", onclick: () => letterExplorer() }, "🔤 All letters"));
  say(`${letter}! Tap a word to hear it.`);
}
let explorerCat = Object.keys(CATEGORY_INFO)[0];

let finderMode = "store";
function storeFinder(selected) {
  const tabs = h("div", { class: "tabs" },
    h("button", { class: finderMode === "store" ? "on" : "", onclick: () => { finderMode = "store"; storeFinder(); } }, "🛒 Store"),
    h("button", { class: finderMode === "state" ? "on" : "", onclick: () => { finderMode = "state"; storeFinder(); } }, "🗺️ State"),
    h("button", { class: finderMode === "hyatt" ? "on" : "", onclick: () => { finderMode = "hyatt"; storeFinder(); } }, "🏨 Hyatt"));

  if (finderMode === "hyatt") return findYourHyatt(tabs, selected);

  if (finderMode === "store") {
    const s = selected ?? STORES_AZ[0];
    screen("Where Is It? 🗺️", tabs,
      strip(STORES_AZ.map((st) =>
        h("button", {
          class: st === s ? "chip on" : "chip",
          style: st === s ? { background: st.color } : {},
          onclick: () => storeFinder(st),
        }, `${st.emoji} ${st.name}`))),
      h("div", { class: "card compact" },
        storeHeader(s, h("div", { class: "sub" }, s.states.length === 50 ? "in all 50 states! 🎉" : `in ${s.states.length} state${s.states.length > 1 ? "s" : ""}`)),
        stateMap((c) => (s.states.includes(c) ? s.color : null), { onTap: (c) => speak(hasLine(s, c)) })));
    if (selected) say(`${s.name} is in ${listWords(s.states.map((c) => STATES[c]))}.`);
    return;
  }

  const code = selected ?? "FL";
  const here = storesInState(code).sort(byName);
  screen("Where Is It? 🗺️", tabs,
    h("div", { class: "card compact" },
      stateMap((c) => (c === code ? "#8f6bff" : null), { onTap: (c) => storeFinder(c) })),
    h("div", { class: "card" },
      h("div", { class: "prompt" }, STATES[code]),
      h("div", { class: "sub" }, `${here.length} store${here.length === 1 ? "" : "s"} · tap one to see its map`),
      here.length
        ? h("div", { class: "chips small" }, here.map((s) => h("button", {
          class: "chip on", style: { background: s.color },
          onclick: () => { finderMode = "store"; storeFinder(s); },
        }, `${s.emoji} ${s.name}`)))
        : h("div", { class: "sub" }, "None of our special stores are here. Walmart and Target are everywhere though!")));
  if (selected) say(here.length ? `${STATES[code]} has ${listWords(here.map((s) => s.name))}.` : `${STATES[code]} doesn't have our special stores.`);
}

const HYATTS = STORES_AZ.filter((s) => s.kind === "hotel");
let hyattBrand = HYATTS[0];
let hyattState = null;

function findYourHyatt(tabs, picked) {
  if (HYATTS.includes(picked)) hyattBrand = picked;
  else if (STATES[picked]) hyattState = picked;
  const b = hyattBrand;
  const here = hyattState ? HYATTS.filter((s) => s.states.includes(hyattState)) : [];
  screen("Find Your Hyatt 🏨", tabs,
    strip(HYATTS.map((s) => h("button", {
      class: s === b ? "chip on" : "chip",
      style: s === b ? { background: s.color } : {},
      onclick: () => findYourHyatt(tabs, s),
    }, `${s.emoji} ${s.name}`))),
    h("div", { class: "card compact" },
      storeHeader(b, h("div", { class: "sub" }, `in ${b.states.length} state${b.states.length > 1 ? "s" : ""}`)),
      stateMap((c) => (b.states.includes(c) ? b.color : null), { ring: hyattState, onTap: (c) => findYourHyatt(tabs, c) })),
    h("div", { class: "card" },
      hyattState
        ? [h("div", { class: "prompt" }, `Hyatts in ${STATES[hyattState]}`),
          here.length
            ? h("div", { class: "chips small" }, here.map((s) => h("button", {
              class: "chip on", style: { background: s.color }, onclick: () => findYourHyatt(tabs, s),
            }, `${s.emoji} ${s.name}`)))
            : h("div", { class: "sub" }, "No Hyatts on our list here yet.")]
        : h("div", { class: "sub" }, "Tap a state to see its Hyatts!")));
  if (HYATTS.includes(picked)) say(`${b.name} is in ${b.states.length} states.`);
  else if (hyattState && STATES[picked]) say(here.length ? `${STATES[hyattState]} has ${listWords(here.map((s) => s.name))}.` : `${STATES[hyattState]} doesn't have a Hyatt on our list.`);
}

const listWords = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`);

// ---------- video station ----------
const loadVideos = () => store.get("videos", []);
const saveVideos = (v) => store.set("videos", v);

function videoStation() {
  const videos = loadVideos();
  const err = h("div", { class: "err" });
  const urlIn = h("input", { placeholder: "Paste a YouTube link", inputmode: "url", autocomplete: "off" });
  const titleIn = h("input", { placeholder: "Name (like: Blippi at the store)", maxlength: "60" });
  const qIn = h("textarea", { rows: "3", placeholder: "Your own questions, one per line (optional)" });

  const removeVideo = (v) => {
    if (confirm(`Remove "${v.title}"?`)) { saveVideos(videos.filter((x) => x.id !== v.id)); videoStation(); }
  };

  const parent = h("details", { class: "parent" },
    h("summary", {}, "👨‍👧 Grown-ups: videos"),
    videos.length ? h("div", { class: "manage" },
      h("div", { class: "sub" }, "Your videos:"),
      videos.map((v) => h("div", { class: "manage-row" },
        h("span", {}, v.title),
        h("button", { class: "remove", onclick: () => removeVideo(v) }, "🗑 Remove")))) : null,
    SING_VIDEOS.some((s) => !videos.some((v) => v.id === s.id))
      ? h("button", { onclick: () => { saveVideos(mergeVideos(videos, SING_VIDEOS)); videoStation(); } }, "🎤 Add all the Sing videos")
      : null,
    h("div", { class: "sub" }, "Add a video:"),
    urlIn, titleIn, qIn,
    h("button", {
      onclick: () => {
        const id = parseYouTubeId(urlIn.value);
        if (!id) { err.textContent = "That doesn't look like a YouTube link."; return; }
        const questions = qIn.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20);
        saveVideos([...videos.filter((v) => v.id !== id), { id, title: titleIn.value.trim().slice(0, 60) || "My video", questions }]);
        videoStation();
      },
    }, "Add video"),
    err,
    h("p", { class: "sub" }, "Find one on YouTube → Share → Copy link → paste here."));

  screen("Video Station 📺",
    h("div", { class: "card" }, h("div", { class: "prompt" }, "Watch, then think! 🧠")),
    videos.length
      ? h("div", { class: "list videos" }, videos.map((v) =>
        h("div", { class: "row", onclick: () => playVideo(v) },
          h("img", {
            src: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, alt: "",
            onload: (e) => { if (isDeadThumb(e.target.naturalWidth, e.target.naturalHeight)) e.target.closest(".row").hidden = true; },
          }),
          h("span", {}, v.title))))
      : h("div", { class: "card sub" }, "No videos yet — ask a grown-up to add some below!"),
    h("div", { class: "card" },
      h("div", { class: "sub" }, "Find more on YouTube:"),
      h("div", { class: "chips" }, VIDEO_CHANNELS.map((c) =>
        h("a", { class: "chip", href: `https://www.youtube.com/results?search_query=${encodeURIComponent(c.search)}`, target: "_blank", rel: "noopener", style: { textDecoration: "none", color: "inherit" } }, `${c.emoji} ${c.name}`)))),
    parent);
}

function playVideo(v) {
  const bank = shuffle([...v.questions, ...shuffle(VIDEO_QUESTIONS)]);
  let i = 0;
  const qText = h("div", { class: "prompt" });
  const show = () => { qText.textContent = bank[i % bank.length]; say(bank[i % bank.length]); };

  screen(v.title,
    h("div", { class: "video-wrap" },
      h("iframe", {
        src: `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&playsinline=1&modestbranding=1`,
        allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
        allowfullscreen: "", title: v.title,
      })),
    h("div", { class: "card" },
      h("div", { class: "sub" }, "🧠 Think about it!"),
      qText,
      h("div", { class: "choices two", style: { marginTop: "14px" } },
        h("button", { class: "choice", onclick: () => speak(qText.textContent) }, "🔊 Again"),
        h("button", { class: "choice yes", style: { fontSize: "1.3rem", minHeight: "72px" }, onclick: () => { celebrate("Great thinking!"); i += 1; show(); } }, "I answered! ⭐"))),
    h("button", { class: "next", onclick: () => { location.hash = "videoStation"; } }, "📺 More videos"));
  qText.textContent = bank[0];
}

function friendPic(c, cls) {
  const box = h("span", { class: `friend-pic ${cls}` }, c.emoji);
  const img = h("img", {
    src: `https://i.ytimg.com/vi/${c.video}/mqdefault.jpg`, alt: c.name,
    style: c.zoom
      ? { objectPosition: `${c.x}% 50%`, transform: `scale(${c.zoom})`, transformOrigin: `${c.x}% 15%` }
      : { objectPosition: `${c.x}% 50%` },
    onload: () => { if (!isDeadThumb(img.naturalWidth, img.naturalHeight)) box.replaceChildren(img); },
  });
  return box;
}

const FRIEND_SETS = [
  ["lbb", "⭐ LBB", LBB_CHARACTERS],
  ["sing", "🎤 Sing", SING_CHARACTERS],
  ["ls", "🎵 Station", LEARNING_STATION_CHARACTERS],
];
let friendSet = "lbb";

function friendsScreen(selected) {
  const list = FRIEND_SETS.find(([k]) => k === friendSet)[2];
  const c = selected ?? list[0];
  const blurb = `This is ${c.name}! ${c.name} is ${c.what}. ${c.facts.join(" ")}`;
  screen("Friends ⭐",
    h("div", { class: "tabs" },
      FRIEND_SETS.map(([k, lbl]) =>
        h("button", {
          class: friendSet === k ? "on" : "",
          onclick: () => { friendSet = k; friendsScreen(); },
        }, lbl))),
    strip(list.map((f) =>
      h("button", {
        class: f === c ? "friend on" : "friend",
        style: f === c ? { background: f.color } : {},
        onclick: () => friendsScreen(f),
      }, friendPic(f, "big"), f.name)), "friends-strip"),
    h("div", { class: "card" },
      h("div", { class: "friend-head" },
        h("div", { class: "friend-face", style: { background: c.color } }, friendPic(c, "giant")),
        h("div", {},
          h("div", { class: "store-name", style: brandText(c.color) }, c.name),
          h("div", { class: "sub" }, `is ${c.what}`),
          sayButton(blurb))),
      h("div", { class: "facts" }, c.facts.map((f, i) => h("button", { class: "fact-chip", style: { "--c": COLORS[i % COLORS.length] }, onclick: () => speak(f) }, f)))));
  if (selected) say(blurb);
}

const GUESS_WHO_SETS = [
  ["mix", "🎲 Mixed", null],
  ["sing", "🎤 Sing", SING_CHARACTERS],
  ["lbb", "⭐ LBB", LBB_CHARACTERS],
  ["ls", "🎵 Station", LEARNING_STATION_CHARACTERS],
];
let guessWhoSet = "mix";

function guessWho() {
  const list = GUESS_WHO_SETS.find(([k]) => k === guessWhoSet)[2];
  const q = list ? makeCharacterQuestion(list) : makeMixedCharacterQuestion([SING_CHARACTERS, LBB_CHARACTERS, LEARNING_STATION_CHARACTERS]);
  const prompt = `${q.clue} Who am I?`;
  const result = h("div");
  const btns = choiceButtons(q.choices, {
    cols: 2,
    label: (c) => c.name,
    isRight: (c) => c === q.answer,
    rightLine: (c) => `It's ${c.name}!`,
    onRight: () => showResult(result, nextButton(guessWho)),
  });
  [...btns.children].forEach((b, i) => { b.classList.add("guess"); b.prepend(friendPic(q.choices[i], "big")); });
  screen("Guess Who? ❓",
    h("div", { class: "tabs" },
      GUESS_WHO_SETS.map(([k, lbl]) =>
        h("button", {
          class: guessWhoSet === k ? "on" : "",
          onclick: () => { guessWhoSet = k; guessWho(); },
        }, lbl))),
    h("div", { class: "card" },
      h("div", { class: "prompt" }, `“${q.clue}”`),
      h("div", { class: "sub" }, "Who am I?"),
      sayButton(prompt),
      streakLine()),
    btns,
    result);
  say(prompt);
}

let popLetter = null;
const POP_CASES = [["upper", "ABC"], ["lower", "abc"], ["mix", "AaBb"]];
let popCase = "upper";
const popShow = (l) => (popCase === "lower" || (popCase === "mix" && Math.random() < 0.5) ? l.toLowerCase() : l);
const pop = () => tone([1400, 700], "square", 0.035);

function letterPop() {
  const { target, balloons } = makeBalloonRound(Math.random, popLetter ?? undefined);
  popLetter = null;
  const need = balloons.filter((b) => b === target).length;
  let got = 0;
  const counter = h("div", { class: "pop-count" }, Array.from({ length: need }, () => h("span", {}, "🎈")));
  const result = h("div", { class: "pop-done" });
  const sky = h("div", { class: "sky" },
    h("div", { class: "cloud c1" }), h("div", { class: "cloud c2" }), result,
    balloons.map((l, i) => {
      const b = h("button", {
        class: "balloon",
        "aria-label": `Balloon ${l}`,
        style: { "--c": COLORS[(i * 3) % COLORS.length], "--d": `${(i % 4) * 0.4}s`, "--s": `${2.6 + (i % 3) * 0.5}s` },
        onclick: () => {
          if (b.classList.contains("popped")) return;
          if (l !== target) {
            b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope");
            boop();
            say(`That's ${l}. Find ${target}!`);
            return;
          }
          b.classList.add("popped");
          pop();
          burst(b);
          counter.children[got].classList.add("got");
          got += 1;
          if (got < need) { say(`Pop! ${need - got} more!`); return; }
          streak += 1;
          celebrate(`You popped all the ${target}s!`);
          showResult(result, h("div", { class: "choices two" },
            h("button", { class: "choice", onclick: () => { popLetter = target; letterPop(); } }, `🔁 ${target} again`),
            h("button", { class: "choice up", onclick: letterPop }, "New letter ➡️")));
        },
      }, h("span", {}, popShow(l)));
      return b;
    }));
  const prompt = `Pop every ${target}!`;
  const shown = popCase === "upper" ? target : popCase === "lower" ? target.toLowerCase() : target + target.toLowerCase();
  screen("Letter Pop 🎈",
    h("div", { class: "tabs" }, POP_CASES.map(([k, lbl]) =>
      h("button", { class: popCase === k ? "on" : "", onclick: () => { popCase = k; popLetter = target; letterPop(); } }, lbl))),
    h("div", { class: "card compact pop-head" },
      h("div", { class: "pop-letter", style: { color: pick(COLORS) } }, shown),
      h("div", {}, h("div", { class: "prompt" }, prompt), counter),
      h("button", { class: "say round", "aria-label": "Hear it", onclick: () => speak(`${prompt} The letter ${target}.`) }, "🔊")),
    sky);
  say(`${prompt} Find the letter ${target}.`);
}

function burst(el) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = h("span", { class: "spark", style: { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 3}px` } }, pick(["✨", "⭐", "💥"]));
    document.body.append(s);
    s.animate([{ transform: "translate(-50%,-50%) scale(.4)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * 70}px), calc(-50% + ${Math.sin(a) * 70}px)) scale(1)`, opacity: 0 }],
    { duration: 600, easing: "ease-out" }).onfinish = () => s.remove();
  }
}

// Each group of three zeros gets its own color so he can count the groups.
function rainbowNumber(n) {
  const text = bigNumberText(n.zeros);
  const size = text.length > 40 ? "small" : text.length > 9 ? "mid" : "";
  return h("button", { class: `big-number ${size}`, onclick: () => speak(n.name) },
    text.split(",").map((g, i, all) => h("span", { style: { color: COLORS[i % COLORS.length] } }, g + (i < all.length - 1 ? "," : ""))));
}

const zerosLine = (n) => (n.zeros === 1 ? "1 zero" : `${n.zeros} zeros`);

function bigFactCard(n) {
  return h("div", { class: "card" },
    h("div", { class: "giant" }, n.emoji),
    rainbowNumber(n),
    h("div", { class: "store-name" }, n.name),
    h("div", { class: "kind" }, `${zerosLine(n)} 0️⃣`),
    h("button", { class: "fact", onclick: () => speak(n.fact) }, n.fact));
}

let bigMode = "climb";
let bigIndex = 0;

function bigNumbers() {
  const tabs = h("div", { class: "tabs" },
    [["climb", "🧗 Climb"], ["quiz", "❓ Quiz"]].map(([k, lbl]) =>
      h("button", { class: bigMode === k ? "on" : "", onclick: () => { bigMode = k; bigNumbers(); } }, lbl)));
  bigMode === "climb" ? bigClimb(tabs) : bigQuiz(tabs);
}

function bigClimb(tabs) {
  const n = BIG_NUMBERS[bigIndex];
  const step = (d) => { bigIndex += d; bigNumbers(); };
  const top = bigIndex === BIG_NUMBERS.length - 1;
  screen("Big Numbers 🔢",
    tabs,
    h("div", { class: "ladder" }, BIG_NUMBERS.map((_, i) =>
      h("span", { class: i <= bigIndex ? "rung on" : "rung" }))),
    bigFactCard(n),
    h("div", { class: "choices two" },
      h("button", { class: "choice", disabled: bigIndex === 0, onclick: () => step(-1) }, "⬇️ Smaller"),
      h("button", { class: "choice up", disabled: top, onclick: () => step(1) }, "Bigger ⬆️")),
    top ? h("button", { class: "next", onclick: () => { bigIndex = 0; bigNumbers(); } }, "Start over 🔁") : "");
  if (top) confetti(30);
  say(`${n.name}! That's a one with ${zerosLine(n)}. ${n.fact}`);
}

const BIG_PROMPTS = {
  name: () => "What is this number called?",
  number: (q) => `Which one is ${q.answer.name}?`,
  zeros: (q) => `How many zeros are in ${q.answer.name}?`,
  bigger: () => "Which number is bigger?",
};
const BIG_LABELS = {
  name: (c) => c.name,
  number: (c) => bigNumberText(c.zeros),
  zeros: (c) => String(c.zeros),
  bigger: (c) => c.name,
};

function bigQuiz(tabs) {
  const q = makeBigNumberQuestion();
  const prompt = BIG_PROMPTS[q.type](q);
  const result = h("div", { class: "reveal" });
  const btns = choiceButtons(q.choices, {
    cols: q.type === "zeros" || q.type === "bigger" ? 2 : 1,
    label: BIG_LABELS[q.type],
    isRight: (c) => c === q.answer,
    rightLine: () => `${q.answer.name} has ${zerosLine(q.answer)}! ${q.answer.fact}`,
    onRight: () => showResult(result, bigFactCard(q.answer), nextButton(bigNumbers)),
  });
  screen("Big Numbers 🔢",
    tabs,
    h("div", { class: "card" },
      q.type === "name" ? rainbowNumber(q.answer) : "",
      h("div", { class: "prompt" }, prompt),
      sayButton(prompt),
      streakLine()),
    btns,
    result);
  say(prompt);
}

// ---------- routing ----------
function route() {
  window.speechSynthesis?.cancel();
  streak = 0;
  trackTurn();
  const game = GAMES.find((g) => g.id === location.hash.slice(1));
  game ? game.run() : home();
}
document.getElementById("home-btn").addEventListener("click", () => { location.hash = ""; });
window.addEventListener("hashchange", route);
route();
navigator.serviceWorker?.register("sw.js");

