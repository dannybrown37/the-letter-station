import { STATES, STORES, KINDS, CATEGORY_INFO, VIDEO_QUESTIONS, VIDEO_CHANNELS, SING_VIDEOS, LBB_CHARACTERS } from "./data.js";
import {
  ALPHABET, pick, shuffle, wordsForLetter, makeLetterQuestion,
  makeStoreQuestion, makeYesNoQuestion, storesInState, parseYouTubeId,
  checkLetterAnswer, firstLetter, isDeadThumb, mergeVideos,
} from "./logic.js";

const byName = (a, b) => a.name.localeCompare(b.name);
const STORES_AZ = [...STORES].sort(byName);

// iOS has no orientation lock; CSS turns the page back, this says which way the phone went.
function trackTurn() {
  const angle = window.orientation ?? screen.orientation?.angle;
  const turn = angle === 90 ? "left" : angle === -90 || angle === 270 ? "right" : null;
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
    else if (k === "style") Object.assign(el.style, v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v);
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
  { id: "storeHunt", label: "Store Hunt", emoji: "🛒", color: "#36c275", run: storeHunt, wide: true },
  { id: "yesNo", label: "Yes or No?", emoji: "🤔", color: "#ff8a3d", run: yesNo },
  { id: "letterTrain", label: "Letter Train", emoji: "🚂", color: "#3fa9f5", run: letterTrain },
  { id: "letterExplorer", label: "ABC Explorer", emoji: "🔤", color: "#8f6bff", run: letterExplorer },
  { id: "storeFinder", label: "Where Is It?", emoji: "🗺️", color: "#ff5ca8", run: storeFinder },
  { id: "lbbFriends", label: "Little Baby Bum Friends", emoji: "⭐", color: "#00b8a9", run: lbbFriends, wide: true },
  { id: "videoStation", label: "Video Station", emoji: "📺", color: "#ffb800", run: videoStation, wide: true },
];

function home() {
  screen("The Letter Station",
    h("div", { class: "card" },
      h("div", { class: "prompt" }, "Hi, friend! 👋"),
      h("div", { class: "sub" }, "What do you want to play?")),
    h("div", { class: "tiles" },
      GAMES.map((g) => h("button", {
        class: g.wide ? "tile wide" : "tile",
        style: { background: g.color },
        onclick: () => { say(g.label); location.hash = g.id; },
      }, h("span", { class: "big" }, g.emoji), g.label))));
}

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

function storeHeader(s) {
  return [storePicture(s), h("div", { class: "store-name", style: brandText(s.color) }, s.name), kindBadge(s)];
}

const article = (word) => (/^[AEIOU]/i.test(word) ? "an" : "a");
const aOrAn = (word) => `${article(word)} ${word}`;

// Big chains read better as "every state except ..." than a wall of 47 chips.
function footprint(s, highlight) {
  const missing = Object.keys(STATES).filter((c) => !s.states.includes(c));
  if (missing.length === 0) return h("div", { class: "prompt", style: brandText(s.color) }, `${s.name} is in all 50 states! 🎉`);
  if (s.states.length > 25) {
    return [
      h("div", { class: "sub" }, `${s.name} is in ${s.states.length} states. Every state except:`),
      stateChips(missing, "#9a90ab", highlight),
    ];
  }
  return [
    h("div", { class: "sub" }, `${s.name} is in ${s.states.length} state${s.states.length > 1 ? "s" : ""}:`),
    stateChips(s.states, s.color, highlight),
  ];
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
      onRight: () => result.replaceChildren(h("div", { class: "card" }, footprint(q.store, q.answer)), nextButton(storeHunt)),
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
        onRight: () => result.replaceChildren(h("div", { class: "card" }, footprint(q.store, q.state)), nextButton(yesNo)),
      });
      btns.children[0].classList.add("yes");
      btns.children[1].classList.add("no");
      return btns;
    })(),
    result);
  say(`${kindLine(q.store)} ${prompt}`);
}

function stateChips(codes, color, highlight) {
  return h("div", { class: "chips" }, [...codes].sort((a, b) => STATES[a].localeCompare(STATES[b])).map((c) =>
    h("span", { class: "chip on", style: { background: color, outline: c === highlight ? "4px solid #fff" : "" } }, STATES[c])));
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
        h("button", { class: "letter", style: { background: COLORS[i % COLORS.length] }, onclick: () => letterExplorer(l) }, l))));
    say("Pick a letter!");
    return;
  }
  const idx = ALPHABET.indexOf(letter);
  const sections = Object.entries(CATEGORY_INFO).map(([cat, info]) => {
    const words = wordsForLetter(letter, cat);
    return h("div", { class: "card" },
      h("div", { class: "prompt" }, `${info.emoji} ${info.label}`),
      words.length
        ? h("div", { class: "chips" }, words.map((w, i) =>
          h("button", { class: "chip", onclick: () => speak(w), style: { borderBottom: `4px solid ${COLORS[i % COLORS.length]}` } }, w)))
        : h("div", { class: "sub" }, `No ${info.label.toLowerCase()} start with ${letter}... yet!`));
  });
  screen(`Letter ${letter}`,
    h("div", { class: "card" },
      h("div", { class: "giant", style: { color: COLORS[idx % COLORS.length] } }, `${letter}${letter.toLowerCase()}`),
      h("div", { class: "tabs" },
        h("button", { onclick: () => letterExplorer(ALPHABET[(idx + 25) % 26]) }, `⬅️ ${ALPHABET[(idx + 25) % 26]}`),
        h("button", { onclick: () => letterExplorer() }, "🔤 All"),
        h("button", { onclick: () => letterExplorer(ALPHABET[(idx + 1) % 26]) }, `${ALPHABET[(idx + 1) % 26]} ➡️`))),
    sections);
  say(`${letter}! Tap a word to hear it.`);
}

let finderMode = "store";
function storeFinder(selected) {
  const tabs = h("div", { class: "tabs" },
    h("button", { class: finderMode === "store" ? "on" : "", onclick: () => { finderMode = "store"; storeFinder(); } }, "🛒 Pick a store"),
    h("button", { class: finderMode === "state" ? "on" : "", onclick: () => { finderMode = "state"; storeFinder(); } }, "🗺️ Pick a state"));

  if (finderMode === "store") {
    const s = selected ?? STORES_AZ[0];
    const grid = h("div", { class: "state-grid" }, Object.keys(STATES).map((c) =>
      h("button", {
        class: s.states.includes(c) ? "state-cell on" : "state-cell",
        style: s.states.includes(c) ? { background: s.color } : {},
        onclick: () => speak(s.states.includes(c) ? `Yes! ${STATES[c]} has ${s.name}` : `No! ${STATES[c]} doesn't have ${s.name}`),
      }, c)));
    screen("Where Is It? 🗺️", tabs,
      h("div", { class: "card" },
        storeHeader(s),
        h("div", { class: "sub" }, `is in ${s.states.length} state${s.states.length > 1 ? "s" : ""}!`),
        grid),
      h("div", { class: "chips" }, STORES_AZ.map((st) =>
        h("button", {
          class: st === s ? "chip on" : "chip",
          style: st === s ? { background: st.color } : {},
          onclick: () => storeFinder(st),
        }, `${st.emoji} ${st.name}`))));
    if (selected) say(`${s.name} is in ${listWords(s.states.map((c) => STATES[c]))}.`);
    return;
  }

  const code = selected ?? "FL";
  const here = storesInState(code).sort(byName);
  screen("Where Is It? 🗺️", tabs,
    h("div", { class: "state-grid", style: { marginBottom: "14px" } }, Object.keys(STATES).map((c) =>
      h("button", {
        class: c === code ? "state-cell on" : "state-cell",
        style: c === code ? { background: "#8f6bff" } : {},
        onclick: () => storeFinder(c),
      }, c))),
    h("div", { class: "card" },
      h("div", { class: "prompt" }, STATES[code]),
      here.length
        ? h("div", { class: "chips" }, here.map((s) => h("span", { class: "chip on", style: { background: s.color } }, `${s.emoji} ${s.name}`)))
        : h("div", { class: "sub" }, "None of our special stores are here. Walmart and Target are everywhere though!")));
  if (selected) say(here.length ? `${STATES[code]} has ${listWords(here.map((s) => s.name))}.` : `${STATES[code]} doesn't have our special stores.`);
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
      ? h("div", { class: "list" }, videos.map((v) =>
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

function lbbFriends(selected) {
  const c = selected ?? LBB_CHARACTERS[0];
  const blurb = `This is ${c.name}! ${c.name} is ${c.what}. ${c.facts.join(" ")}`;
  screen("LBB Friends ⭐",
    h("div", { class: "card" },
      h("div", { class: "giant friend-face", style: { background: c.color } }, c.emoji),
      h("div", { class: "store-name", style: brandText(c.color) }, c.name),
      h("div", { class: "sub" }, `is ${c.what}`),
      h("div", { class: "chips" }, c.facts.map((f) => h("button", { class: "chip", onclick: () => speak(f) }, f))),
      sayButton(blurb)),
    h("div", { class: "friend-grid" }, LBB_CHARACTERS.map((f) =>
      h("button", {
        class: f === c ? "friend on" : "friend",
        style: f === c ? { background: f.color } : {},
        onclick: () => lbbFriends(f),
      }, h("span", { class: "big" }, f.emoji), f.name))));
  if (selected) say(blurb);
}

// ---------- routing ----------
function route() {
  window.speechSynthesis?.cancel();
  streak = 0;
  const game = GAMES.find((g) => g.id === location.hash.slice(1));
  game ? game.run() : home();
}
document.getElementById("home-btn").addEventListener("click", () => { location.hash = ""; });
window.addEventListener("hashchange", route);
route();
navigator.serviceWorker?.register("sw.js");

