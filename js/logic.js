import { BIG_NUMBERS, STATES, STATE_NEIGHBORS, STORES, WORDS } from "./data.js";

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

export function shuffle(arr, rng = Math.random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const firstLetter = (word) => (word.match(/[a-z]/i)?.[0] ?? "").toUpperCase();

export const wordsForLetter = (letter, category) =>
  WORDS[category].filter((w) => firstLetter(w) === letter);

export const playableLetters = (category) =>
  ALPHABET.filter((l) => wordsForLetter(l, category).length > 0);

export function makeLetterQuestion(rng = Math.random, { letter, category } = {}) {
  category ??= pick(Object.keys(WORDS), rng);
  letter ??= pick(playableLetters(category), rng);
  const answer = pick(wordsForLetter(letter, category), rng);
  const others = shuffle(WORDS[category].filter((w) => firstLetter(w) !== letter), rng).slice(0, 3);
  return { letter, category, answer, choices: shuffle([answer, ...others], rng) };
}

const squash = (s) => s.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");

// Typed answers are forgiving: case, spaces, and punctuation don't matter ("chickfila" = "Chick-fil-A").
export function checkLetterAnswer(input, letter, category) {
  const typed = squash(input);
  if (!typed) return { status: "empty", word: null };
  if (firstLetter(input) !== letter) return { status: "wrongLetter", word: null };
  const word = wordsForLetter(letter, category).find((w) => squash(w) === typed) ?? null;
  return { status: word ? "right" : "unknown", word };
}

const ALL_STATES = Object.keys(STATES);
const notIn = (store) => ALL_STATES.filter((c) => !store.states.includes(c));

// Stores in most states flip to "which state does NOT have it?"; stores in every state can't be asked.
export const HUNTABLE_STORES = STORES.filter((s) => notIn(s).length > 0);

export function makeStoreQuestion(rng = Math.random, store = pick(HUNTABLE_STORES, rng)) {
  const without = notIn(store);
  const has = store.states.length <= ALL_STATES.length / 2;
  const [right, wrong] = has ? [store.states, without] : [without, store.states];
  const answer = pick(right, rng);
  const choices = shuffle([answer, ...shuffle(wrong, rng).slice(0, 3)], rng);
  return { store, has, answer, choices };
}

export const HYATTS = STORES.filter((s) => s.kind === "hotel");
export const HYATT_QUIZ_TYPES = ["state", "brand", "bigger"];

export function makeHyattQuestion(rng = Math.random, type = pick(HYATT_QUIZ_TYPES, rng)) {
  if (type === "state") return { type, ...makeStoreQuestion(rng, pick(HYATTS, rng)) };
  if (type === "brand") {
    const askable = ALL_STATES.filter((c) => HYATTS.some((s) => s.states.includes(c)) && HYATTS.filter((s) => !s.states.includes(c)).length >= 3);
    const state = pick(askable, rng);
    const answer = pick(HYATTS.filter((s) => s.states.includes(state)), rng);
    const others = shuffle(HYATTS.filter((s) => !s.states.includes(state)), rng).slice(0, 3);
    return { type, state, answer, choices: shuffle([answer, ...others], rng) };
  }
  const a = pick(HYATTS, rng);
  const b = pick(HYATTS.filter((s) => s.hotels !== a.hotels), rng);
  return { type, answer: a.hotels > b.hotels ? a : b, choices: [a, b] };
}

export const roomNumber = (rng = Math.random) => (1 + Math.floor(rng() * 12)) * 100 + Math.floor(rng() * 100);

export function makeYesNoQuestion(rng = Math.random) {
  const store = pick(STORES, rng);
  const state = rng() < 0.5 ? pick(store.states, rng) : pick(Object.keys(STATES), rng);
  return { store, state, answer: store.states.includes(state) };
}

export function makeCharacterQuestion(list, rng = Math.random) {
  const answer = pick(list, rng);
  const others = shuffle(list.filter((c) => c !== answer), rng).slice(0, 3);
  return { answer, clue: pick(answer.clues, rng), choices: shuffle([answer, ...others], rng) };
}

// Clues are only unique within one show, so a same-animal friend from another show
// (LBB Pig vs Sing's Rosita) would make "I say oink oink!" ambiguous.
export function makeMixedCharacterQuestion(lists, rng = Math.random) {
  const home = pick(lists, rng);
  const answer = pick(home, rng);
  const fromOthers = lists.filter((l) => l !== home).flat().filter((c) => c.emoji !== answer.emoji);
  const otherShow = pick(fromOthers, rng);
  const rest = shuffle([...home, ...fromOthers].filter((c) => c !== answer && c !== otherShow), rng).slice(0, 2);
  return { answer, clue: pick(answer.clues, rng), choices: shuffle([answer, otherShow, ...rest], rng) };
}

export const storesInState =(code) => STORES.filter((s) => s.states.includes(code));

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com"]);
const YT_ID = /^[\w-]{11}$/;

export function parseYouTubeId(input) {
  const text = input.trim();
  if (YT_ID.test(text)) return text;
  let url;
  try { url = new URL(text); } catch { return null; }
  if (!YT_HOSTS.has(url.hostname)) return null;
  const candidate = url.hostname === "youtu.be"
    ? url.pathname.slice(1)
    : url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
  return candidate && YT_ID.test(candidate) ? candidate : null;
}

// YouTube serves a 120x90 grey placeholder for removed videos; real mqdefault thumbs are 320x180.
export const isDeadThumb = (width, height) => width === 120 && height === 90;

export const mergeVideos = (saved, pack) => {
  const have = new Set(saved.map((v) => v.id));
  return [...saved, ...pack.filter((v) => !have.has(v.id))];
};

export const bigNumberText = (zeros) => ("1" + "0".repeat(zeros)).replace(/\B(?=(\d{3})+$)/g, ",");

export const BIG_QUIZ_TYPES = ["name", "number", "zeros", "bigger"];
const SHORT_BIG = BIG_NUMBERS.filter((n) => n.zeros <= 15);

export function makeBigNumberQuestion(rng = Math.random, type = pick(BIG_QUIZ_TYPES, rng)) {
  const pool = type === "number" ? SHORT_BIG : BIG_NUMBERS;
  const picks = shuffle(pool, rng).slice(0, type === "bigger" ? 2 : 4);
  const answer = type === "bigger" ? picks.reduce((a, b) => (b.zeros > a.zeros ? b : a)) : picks[0];
  return { type, answer, choices: shuffle(picks, rng) };
}

// Full-size ANSI board in key units (1u = one letter key). Each run lays keys left to right from x.
// Entry: "id" (label = id), or [id, label, w = 1, h = 1].
const run = (y, x, keys) => keys.map((k) => {
  const [id, label = id, w = 1, h = 1] = typeof k === "string" ? [k] : k;
  const key = { id, label, x, y, w, h };
  x += w;
  return key;
});
const chars = (s) => [...s];
export const KEYBOARD = [
  ...run(0, 0, ["Esc"]),
  ...run(0, 2, ["F1", "F2", "F3", "F4"]),
  ...run(0, 6.5, ["F5", "F6", "F7", "F8"]),
  ...run(0, 11, ["F9", "F10", "F11", "F12"]),
  ...run(0, 15.25, [["PrtSc", "Prt"], ["ScrLk", "Scr"], ["Pause", "Pse"]]),
  ...run(1, 0, [["Backtick", "`"], ...chars("1234567890"), ["Minus", "-"], ["Equals", "="], ["Backspace", "⌫", 2]]),
  ...run(1, 15.25, [["Ins", "Ins"], ["Home", "Home"], ["PgUp", "PgUp"]]),
  ...run(1, 18.5, [["NumLock", "Num"], ["NumSlash", "/"], ["NumStar", "*"], ["NumMinus", "-"]]),
  ...run(2, 0, [["Tab", "Tab", 1.5], ...chars("QWERTYUIOP"), ["LBracket", "["], ["RBracket", "]"], ["Backslash", "\\", 1.5]]),
  ...run(2, 15.25, [["Del", "Del"], ["End", "End"], ["PgDn", "PgDn"]]),
  ...run(2, 18.5, [["Num7", "7"], ["Num8", "8"], ["Num9", "9"], ["NumPlus", "+", 1, 2]]),
  ...run(3, 0, [["Caps", "Caps", 1.75], ...chars("ASDFGHJKL"), ["Semicolon", ";"], ["Quote", "'"], ["Enter", "Enter", 2.25]]),
  ...run(3, 18.5, [["Num4", "4"], ["Num5", "5"], ["Num6", "6"]]),
  ...run(4, 0, [["ShiftL", "Shift", 2.25], ...chars("ZXCVBNM"), ["Comma", ","], ["Period", "."], ["Slash", "/"], ["ShiftR", "Shift", 2.75]]),
  ...run(4, 16.25, [["Up", "↑"]]),
  ...run(4, 18.5, [["Num1", "1"], ["Num2", "2"], ["Num3", "3"], ["NumEnter", "⏎", 1, 2]]),
  ...run(5, 0, [["CtrlL", "Ctrl", 1.25], ["Win", "❖", 1.25], ["AltL", "Alt", 1.25], ["Space", "", 6.25], ["AltR", "Alt", 1.25], ["Fn", "Fn", 1.25], ["Menu", "☰", 1.25], ["CtrlR", "Ctrl", 1.25]]),
  ...run(5, 15.25, [["Left", "←"], ["Down", "↓"], ["Right", "→"]]),
  ...run(5, 18.5, [["Num0", "0", 2], ["NumDot", "."]]),
];
export const KEYBOARD_WIDTH = 22.5;
const KEY_IDS = new Set(KEYBOARD.map((k) => k.id));

const KEY_NAMES = {
  Esc: "escape", PrtSc: "print screen", ScrLk: "scroll lock", Pause: "pause", Backtick: "backtick", Minus: "minus", Equals: "equals",
  Backspace: "backspace", Ins: "insert", Home: "home", PgUp: "page up", PgDn: "page down", Del: "delete", End: "end",
  NumLock: "num lock", NumSlash: "number pad slash", NumStar: "number pad star", NumMinus: "number pad minus", NumPlus: "number pad plus",
  NumEnter: "number pad enter", NumDot: "number pad dot", Tab: "tab", LBracket: "left bracket", RBracket: "right bracket",
  Backslash: "backslash", Caps: "caps lock", Semicolon: "semicolon", Quote: "quote", Enter: "enter", ShiftL: "shift", ShiftR: "shift",
  Comma: "comma", Period: "period", Slash: "slash", CtrlL: "control", CtrlR: "control", Win: "windows key", AltL: "alt", AltR: "alt",
  Space: "space bar", Fn: "function", Menu: "menu", Up: "up arrow", Down: "down arrow", Left: "left arrow", Right: "right arrow",
};
export const keyName = (id) =>
  KEY_NAMES[id] ?? (/^F\d+$/.test(id) ? `F ${id.slice(1)}` : /^Num\d$/.test(id) ? `number pad ${id.slice(3)}` : id);

export const PAINTS = [
  { name: "red", color: "#ff4d5e" },
  { name: "orange", color: "#ff8a3d" },
  { name: "yellow", color: "#ffd23f" },
  { name: "green", color: "#36c275" },
  { name: "blue", color: "#3fa9f5" },
  { name: "purple", color: "#8f6bff" },
  { name: "pink", color: "#ff5ca8" },
  { name: "white", color: "#f4f0fa" },
];

export const FINISHES = [
  { id: "solid", label: "Plain" },
  { id: "stripes", label: "Stripes" },
  { id: "dots", label: "Polka dots" },
  { id: "glitter", label: "Glitter" },
  { id: "rainbow", label: "Rainbow" },
  { id: "split", label: "Two-tone" },
];
const FINISH_IDS = new Set(FINISHES.map((f) => f.id));

const HEX = /^#[0-9a-f]{6}$/i;
const SNAPSHOT = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

// Old saves stored a bare "#hex" per key; they become plain-finish keys.
function loadKey(v) {
  if (typeof v === "string") return HEX.test(v) ? { c: v, f: "solid" } : null;
  if (!v || typeof v !== "object" || typeof v.c !== "string" || !HEX.test(v.c)) return null;
  const key = { c: v.c, f: FINISH_IDS.has(v.f) ? v.f : "solid" };
  if (typeof v.img === "string" && SNAPSHOT.test(v.img)) key.img = v.img;
  return key;
}

export function loadKeyboard(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw)
    .filter(([k]) => KEY_IDS.has(k))
    .map(([k, v]) => [k, loadKey(v)])
    .filter(([, v]) => v));
}

export function keyWord(letter, rng = Math.random) {
  const words = Object.keys(WORDS).flatMap((c) => wordsForLetter(letter, c));
  return words.length ? pick(words, rng) : null;
}

export const KEY_MISSION_TYPES = ["vowels", "spell", "letter", "finish"];
const lettersOf = (name) => [...new Set(name.toUpperCase().replace(/[^A-Z]/g, ""))];
const SPELLABLE = STORES.filter((s) => { const n = s.name.replace(/[^a-z]/gi, "").length; return n >= 3 && n <= 7; });

export function makeKeyMission(rng = Math.random, type = pick(KEY_MISSION_TYPES, rng)) {
  if (type === "spell" || type === "finish") {
    const s = pick(SPELLABLE, rng);
    const letters = lettersOf(s.name);
    const spelled = letters.join("-");
    if (type === "finish") {
      const finish = pick(FINISHES.slice(1), rng);
      return { type, letters, color: null, finish: finish.id, word: s.name, text: `Give ${spelled} ${finish.label.toLowerCase()} keys!` };
    }
    const colorName = `${s.name} color`;
    return { type, letters, color: s.color, colorName, finish: null, word: s.name, text: `Paint ${spelled} ${colorName}!` };
  }
  const paint = pick(PAINTS, rng);
  if (type === "vowels") {
    return { type, letters: ["A", "E", "I", "O", "U"], color: paint.color, colorName: paint.name, finish: null, text: `Paint all the vowels ${paint.name}!` };
  }
  const letter = pick(ALPHABET.filter((l) => keyWord(l, rng)), rng);
  const word = keyWord(letter, rng);
  return { type, letters: [letter], color: paint.color, colorName: paint.name, finish: null, word, text: `Paint ${letter} for ${word} ${paint.name}!` };
}

export const keyMeetsMission = (key, mission) =>
  Boolean(key) && (!mission.color || key.c === mission.color) && (!mission.finish || key.f === mission.finish);

export const missionDone = (board, mission) => mission.letters.every((l) => keyMeetsMission(board[l], mission));

export const boardComplete = (board) => KEYBOARD.every((k) => board[k.id]);

export const loadGallery = (raw) =>
  (Array.isArray(raw) ? raw : []).map(loadKeyboard).filter(boardComplete);

export const neighbors = (code) => STATE_NEIGHBORS[code] ?? [];

export function travelMode(from, to) {
  if (!from) return "start";
  if (from === to) return "here";
  return neighbors(from).includes(to) ? "drive" : "fly";
}

export const TRIP_STOP_TYPES = ["store", "letter", "grammar"];
const ALL_WORDS = [...new Set(Object.values(WORDS).flat())];

export function makeTripStop(rng = Math.random, state, type = pick(TRIP_STOP_TYPES, rng)) {
  if (type === "grammar") return { type, ...makeGrammarQuestion(rng, state) };
  if (type === "store") {
    const answer = pick(HUNTABLE_STORES.filter((s) => s.states.includes(state)), rng);
    const others = shuffle(STORES.filter((s) => !s.states.includes(state)), rng).slice(0, 3);
    return { type, state, answer, choices: shuffle([answer, ...others], rng) };
  }
  const letter = firstLetter(STATES[state]);
  const answer = pick(ALL_WORDS.filter((w) => firstLetter(w) === letter && w !== STATES[state]), rng);
  const others = shuffle(ALL_WORDS.filter((w) => firstLetter(w) !== letter), rng).slice(0, 3);
  return { type, state, letter, answer, choices: shuffle([answer, ...others], rng) };
}

// "Dream Hotels is in Utah" reads wrong, so sentences only use shops and restaurants.
const sentenceStores = (state) => STORES.filter((s) => s.kind !== "hotel" && s.states.includes(state));

const PAST_VERBS = [
  { base: "go", past: "went", oops: "goed", rest: (c) => `to ${c.store.name}` },
  { base: "drive", past: "drove", oops: "drived", rest: (c) => `to ${c.stateName}` },
  { base: "buy", past: "bought", oops: "buyed", rest: (c) => `snacks at ${c.store.name}` },
  { base: "see", past: "saw", oops: "seed", rest: (c) => `a big ${c.store.name} in ${c.stateName}` },
  { base: "eat", past: "ate", oops: "eated", rest: (c) => `lunch at ${c.restaurant.name}`, needsRestaurant: true },
];

const FOODS = ["apple", "orange", "egg", "ice cream cone", "banana", "cookie", "pretzel", "muffin"];
const articleFor = (word) => (/^[aeiou]/i.test(word) ? "an" : "a");

const GRAMMAR = {
  past: (c, rng) => {
    const v = pick(PAST_VERBS.filter((x) => !x.needsRestaurant || c.restaurant), rng);
    const line = (verb) => `Yesterday we ${verb} ${v.rest(c)}.`;
    return { right: line(v.past), wrong: [line(v.oops), line(v.base)], tip: `Yesterday already happened, so ${v.base} becomes ${v.past}!` };
  },
  hasHave: (c) => ({
    right: `${c.stateName} has ${c.store.name} ${c.noun}s.`,
    wrong: [`${c.stateName} have ${c.store.name} ${c.noun}s.`],
    tip: "One state has. Two states have.",
  }),
  isAre: (c) => ({
    right: `${c.store.name} is in ${c.stateName}.`,
    wrong: [`${c.store.name} are in ${c.stateName}.`],
    tip: `${c.store.name} is one ${c.noun} name, so we say is.`,
  }),
  iMe: (c, rng) => {
    const who = pick(["Mom", "Dad"], rng);
    return rng() < 0.5
      ? { right: `${who} and I went to ${c.store.name}.`, wrong: [`${who} and me went to ${c.store.name}.`], tip: `Take away "${who} and": I went, not me went.` }
      : { right: `${c.store.name} gave ${who} and me a sticker.`, wrong: [`${c.store.name} gave ${who} and I a sticker.`], tip: `Take away "${who} and": gave me, not gave I.` };
  },
  plural: (c) => ({
    right: `We saw two ${c.store.name} ${c.noun}s in ${c.stateName}.`,
    wrong: [`We saw two ${c.store.name} ${c.noun} in ${c.stateName}.`],
    tip: `Two is more than one, so add an s: ${c.noun}s.`,
  }),
  capital: (c) => ({
    right: `We drove to ${c.stateName}.`,
    wrong: [`We drove to ${c.stateName.toLowerCase()}.`],
    tip: "State names start with a capital letter.",
  }),
  question: (c) => ({
    right: `Does ${c.stateName} have ${c.store.name} ${c.noun}s?`,
    wrong: [`Does ${c.stateName} have ${c.store.name} ${c.noun}s.`],
    tip: "Asking something? End with a question mark.",
  }),
  aAn: (c, rng) => {
    const food = pick(FOODS, rng);
    const art = articleFor(food);
    return {
      right: `At ${c.store.name}, we bought ${art} ${food}.`,
      wrong: [`At ${c.store.name}, we bought ${art === "an" ? "a" : "an"} ${food}.`],
      tip: `We say ${art} ${food}, because ${food} starts with a ${art === "an" ? "vowel" : "consonant"} sound.`,
    };
  },
};
export const GRAMMAR_RULES = Object.keys(GRAMMAR);

export function makeGrammarQuestion(rng = Math.random, state, rule = pick(GRAMMAR_RULES, rng)) {
  const stores = sentenceStores(state);
  const restaurants = stores.filter((s) => s.kind === "restaurant");
  const store = pick(stores, rng);
  const ctx = {
    stateName: STATES[state], store, noun: store.kind === "restaurant" ? "restaurant" : "store",
    restaurant: restaurants.length ? pick(restaurants, rng) : null,
  };
  const { right, wrong, tip } = GRAMMAR[rule](ctx, rng);
  return { rule, state, answer: right, choices: shuffle([right, ...wrong], rng), tip };
}

const isStateCode = (c) => typeof c === "string" && Object.hasOwn(STATES, c);

export function loadPassport(raw) {
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const stamps = Array.isArray(p.stamps) ? [...new Set(p.stamps.filter(isStateCode))] : [];
  const trips = Number.isInteger(p.trips) && p.trips > 0 ? p.trips : 0;
  return { stamps, at: isStateCode(p.at) ? p.at : null, trips };
}

const byStateName = (a, b) => STATES[a].localeCompare(STATES[b]);
export const PASSPORT_ORDER = Object.keys(STATES).sort(byStateName);

const andList = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`);

export function neighborLine(code) {
  const ns = [...neighbors(code)].sort(byStateName).map((c) => STATES[c]);
  return ns.length ? `${STATES[code]} touches ${andList(ns)}.` : `${STATES[code]} doesn't touch any other state. You have to fly!`;
}

export const finishTrip = (p) =>
  (p.stamps.length === PASSPORT_ORDER.length ? { stamps: [], at: p.at, trips: p.trips + 1 } : p);

// 8 balloons, 2-3 carry the target letter, the rest are other letters.
export function makeBalloonRound(rng = Math.random, target = pick(ALPHABET, rng)) {
  const hits = 2 + Math.floor(rng() * 2);
  const others = shuffle(ALPHABET.filter((l) => l !== target), rng).slice(0, 8 - hits);
  return { target, balloons: shuffle([...Array(hits).fill(target), ...others], rng) };
}
