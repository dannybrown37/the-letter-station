import { WORDS } from "./data.js";
import { pick, shuffle } from "./logic.js";

export const LINEUP_SIZE = 4;

// ABC order ignores case, spaces and punctuation: "Chick-fil-A" sorts as "chickfila".
export const abcKey = (word) => word.normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "");
const byAbc = (a, b) => abcKey(a).localeCompare(abcKey(b));

// Greedy: walk a shuffled list, keep words whose letter at `at` is new.
function distinctAt(words, at, rng) {
  const seen = new Set();
  const out = [];
  for (const w of shuffle(words, rng)) {
    const ch = abcKey(w)[at];
    if (!/[a-z]/.test(ch ?? "") || seen.has(ch)) continue;
    seen.add(ch);
    out.push(w);
    if (out.length === LINEUP_SIZE) break;
  }
  return out;
}

const secondLetters = (words) => new Set(words.map((w) => abcKey(w)[1]).filter((c) => /[a-z]/.test(c ?? "")));
const startingWith = (category, l) => WORDS[category].filter((w) => abcKey(w)[0] === l);
const trickyLetters = (category) =>
  [..."abcdefghijklmnopqrstuvwxyz"].filter((l) => secondLetters(startingWith(category, l)).size >= LINEUP_SIZE);

export function makeLineUp(rng = Math.random, { category = pick(Object.keys(WORDS), rng), tricky = false } = {}) {
  let letter;
  let picked;
  if (tricky) {
    const l = pick(trickyLetters(category), rng);
    letter = l.toUpperCase();
    picked = distinctAt(startingWith(category, l), 1, rng);
  } else {
    picked = distinctAt(WORDS[category], 0, rng);
  }
  const order = [...picked].sort(byAbc);
  const words = shuffle(picked, rng);
  if (words.every((w, i) => w === order[i])) [words[0], words[1]] = [words[1], words[0]];
  return { category, tricky, letter, words, order };
}

export function lineUpHint(round, placed) {
  if (round.tricky) return `They all start with ${round.letter}. Look at the second letter!`;
  if (placed === 0) return "Look for the letter closest to A!";
  const prev = round.order[placed - 1];
  return `${prev} starts with ${abcKey(prev)[0].toUpperCase()}. Which letter comes next?`;
}
