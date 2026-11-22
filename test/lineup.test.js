import { test } from "node:test";
import assert from "node:assert/strict";
import { abcKey, makeLineUp, lineUpHint, LINEUP_SIZE } from "../js/lineup-logic.js";
import { WORDS } from "../js/data.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const SEEDS = [1, 2, 3, 42, 99, 1234, 777, 31337];
const CATEGORIES = Object.keys(WORDS);

for (const [word, key] of [
  ["Chick-fil-A", "chickfila"],
  ["Trader Joe's", "traderjoes"],
  ["M&M's", "mms"],
  ["Barnes & Noble", "barnesnoble"],
  ["Café", "cafe"],
  ["7-Eleven", "7eleven"],
]) {
  test(`abcKey ${word} → ${key}`, () => assert.equal(abcKey(word), key));
}

for (const seed of SEEDS) {
  for (const category of CATEGORIES) {
    for (const tricky of [false, true]) {
      test(`seed ${seed} ${category} ${tricky ? "tricky" : "abc"}: a fair round`, () => {
        const r = makeLineUp(seeded(seed), { category, tricky });
        assert.equal(r.category, category);
        assert.equal(r.words.length, LINEUP_SIZE);
        assert.equal(new Set(r.words).size, LINEUP_SIZE);
        for (const w of r.words) assert.ok(WORDS[category].includes(w), w);
        assert.deepEqual([...r.words].sort(), [...r.order].sort());
        assert.deepEqual(r.order, [...r.order].sort((a, b) => abcKey(a).localeCompare(abcKey(b))));
        assert.notDeepEqual(r.words, r.order, "already lined up is no puzzle");
        const firsts = r.order.map((w) => abcKey(w)[0]);
        if (tricky) {
          assert.equal(new Set(firsts).size, 1, "tricky words share a first letter");
          assert.equal(r.letter, firsts[0].toUpperCase());
          const seconds = r.order.map((w) => abcKey(w)[1]);
          assert.equal(new Set(seconds).size, LINEUP_SIZE, "second letters decide");
          for (const s of seconds) assert.match(s, /[a-z]/);
        } else {
          assert.equal(new Set(firsts).size, LINEUP_SIZE, "first letters decide");
        }
      });
    }
  }
}

test("category is picked when not given", () => {
  for (const seed of SEEDS) assert.ok(CATEGORIES.includes(makeLineUp(seeded(seed)).category));
});

const abc = { tricky: false, order: ["Aldi", "Costco", "Meijer", "Target"] };
const tricky = { tricky: true, letter: "W", order: ["Washington", "West Virginia", "Wisconsin", "Wyoming"] };
for (const [round, placed, hint] of [
  [abc, 0, "Look for the letter closest to A!"],
  [abc, 1, "Aldi starts with A. Which letter comes next?"],
  [abc, 3, "Meijer starts with M. Which letter comes next?"],
  [tricky, 0, "They all start with W. Look at the second letter!"],
  [tricky, 2, "They all start with W. Look at the second letter!"],
]) {
  test(`lineUpHint ${round.tricky ? "tricky" : "abc"} placed ${placed}`, () => {
    assert.equal(lineUpHint(round, placed), hint);
  });
}
