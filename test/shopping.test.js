import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOP_STORES, LIST_SIZE, SHELF_SIZE, makeShoppingTrip, matchList, listLine } from "../js/shopping-logic.js";
import { firstLetter } from "../js/logic.js";
import { WORDS } from "../js/data.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const SEEDS = [1, 2, 3, 42, 99, 1234, 777, 31337];

test("shop stores are places that sell snacks", () => {
  assert.ok(SHOP_STORES.length >= 10);
  for (const s of SHOP_STORES) assert.ok(["grocery", "superstore", "warehouse", "gas"].includes(s.kind), s.name);
  assert.ok(SHOP_STORES.some((s) => s.name === "Publix"));
  assert.ok(!SHOP_STORES.some((s) => s.kind === "hotel" || s.kind === "restaurant"));
});

for (const seed of SEEDS) {
  test(`seed ${seed}: every list item is on the shelf, and every clue has one answer`, () => {
    const t = makeShoppingTrip(seeded(seed));
    assert.equal(t.list.length, LIST_SIZE);
    assert.equal(t.shelf.length, SHELF_SIZE);
    assert.equal(new Set(t.shelf).size, SHELF_SIZE);
    for (const w of t.shelf) assert.ok(WORDS.snacks.includes(w), w);
    for (const item of t.list) {
      assert.ok(t.shelf.includes(item.word));
      assert.equal(item.letter, firstLetter(item.word));
      assert.ok(["word", "letter"].includes(item.clue));
      assert.deepEqual(t.shelf.filter((w) => firstLetter(w) === item.letter), [item.word], "letter clue must be unambiguous");
    }
  });
}

test("both kinds of clue show up across trips", () => {
  const clues = new Set(SEEDS.flatMap((s) => makeShoppingTrip(seeded(s)).list.map((i) => i.clue)));
  assert.deepEqual([...clues].sort(), ["letter", "word"]);
});

const list = [
  { word: "Goldfish", letter: "G", clue: "word" },
  { word: "Oreos", letter: "O", clue: "letter" },
  { word: "Pretzels", letter: "P", clue: "word" },
];
for (const [got, word, want] of [
  [[], "Goldfish", 0],
  [[], "Oreos", 1],
  [[], "Pretzels", 2],
  [[0], "Goldfish", -1],
  [[], "Takis", -1],
  [[], "Gushers", -1],
  [[], "Oatmeal Creme Pies", 1],
]) {
  test(`matchList got=[${got}] ${word} → ${want}`, () => {
    assert.equal(matchList(list, new Set(got), word), want);
  });
}

for (const [item, line] of [
  [list[0], "Goldfish"],
  [list[1], "a snack that starts with O"],
]) {
  test(`listLine ${item.clue}`, () => assert.equal(listLine(item), line));
}
