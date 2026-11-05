import { BIG_NUMBERS, STATES, STORES, WORDS } from "./data.js";

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

export const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

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

const HEX = /^#[0-9a-f]{6}$/i;
const UPPER = /^[A-Z]$/;

export function loadKeyboard(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => UPPER.test(k) && typeof v === "string" && HEX.test(v)));
}

export function keyWord(letter, rng = Math.random) {
  const words = Object.keys(WORDS).flatMap((c) => wordsForLetter(letter, c));
  return words.length ? pick(words, rng) : null;
}

export const KEY_MISSION_TYPES = ["vowels", "spell", "letter"];
const lettersOf = (name) => [...new Set(name.toUpperCase().replace(/[^A-Z]/g, ""))];
const SPELLABLE = STORES.filter((s) => { const n = s.name.replace(/[^a-z]/gi, "").length; return n >= 3 && n <= 7; });

export function makeKeyMission(rng = Math.random, type = pick(KEY_MISSION_TYPES, rng)) {
  if (type === "spell") {
    const s = pick(SPELLABLE, rng);
    const letters = lettersOf(s.name);
    const colorName = `${s.name} color`;
    return { type, letters, color: s.color, colorName, word: s.name, text: `Paint ${letters.join("-")} ${colorName}!` };
  }
  const paint = pick(PAINTS, rng);
  if (type === "vowels") {
    return { type, letters: ["A", "E", "I", "O", "U"], color: paint.color, colorName: paint.name, text: `Paint all the vowels ${paint.name}!` };
  }
  const letter = pick(ALPHABET.filter((l) => keyWord(l, rng)), rng);
  const word = keyWord(letter, rng);
  return { type, letters: [letter], color: paint.color, colorName: paint.name, word, text: `Paint ${letter} for ${word} ${paint.name}!` };
}

export const missionDone = (board, mission) => mission.letters.every((l) => board[l] === mission.color);
