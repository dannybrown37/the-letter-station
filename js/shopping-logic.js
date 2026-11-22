import { STORES, WORDS } from "./data.js";
import { firstLetter, shuffle } from "./logic.js";

export const SHOP_STORES = STORES.filter((s) => ["grocery", "superstore", "warehouse", "gas"].includes(s.kind));
export const LIST_SIZE = 3;
export const SHELF_SIZE = 8;

// List items have unique first letters and the extras avoid those letters,
// so "a snack that starts with G" has exactly one answer on the shelf.
export function makeShoppingTrip(rng = Math.random) {
  const letters = new Set();
  const list = [];
  for (const word of shuffle(WORDS.snacks, rng)) {
    const letter = firstLetter(word);
    if (letters.has(letter)) continue;
    letters.add(letter);
    list.push({ word, letter, clue: rng() < 0.5 ? "word" : "letter" });
    if (list.length === LIST_SIZE) break;
  }
  const extras = shuffle(WORDS.snacks.filter((w) => !letters.has(firstLetter(w))), rng).slice(0, SHELF_SIZE - LIST_SIZE);
  return { list, shelf: shuffle([...list.map((i) => i.word), ...extras], rng) };
}

const fits = (item, word) => (item.clue === "word" ? item.word === word : firstLetter(word) === item.letter);
export const matchList = (list, got, word) => list.findIndex((item, i) => !got.has(i) && fits(item, word));

export const listLine = (item) => (item.clue === "word" ? item.word : `a snack that starts with ${item.letter}`);
