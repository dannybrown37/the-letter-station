import { STATES, STORES, WORDS } from "./data.js";

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
