import { test } from "node:test";
import assert from "node:assert/strict";
import { SPOT_TYPES, SPOT_STORES, SPOT_LETTERS, makeSpotRound, spotTap, spotPrompt, spotMissLine, spotDoneLine } from "../js/spotter-logic.js";
import { STATES, STORES } from "../js/data.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const SEEDS = [1, 2, 3, 42, 99, 1234];

for (const seed of SEEDS) {
  for (const type of SPOT_TYPES) {
    test(`seed ${seed} ${type}: targets are real, unique state codes`, () => {
      const r = makeSpotRound(seeded(seed), type);
      assert.equal(r.type, type);
      assert.ok(r.targets.length >= 1);
      assert.equal(new Set(r.targets).size, r.targets.length);
      for (const c of r.targets) assert.ok(STATES[c], c);
    });
  }

  test(`seed ${seed} state round has one target`, () => {
    assert.equal(makeSpotRound(seeded(seed), "state").targets.length, 1);
  });

  test(`seed ${seed} letter round = every state with that letter`, () => {
    const r = makeSpotRound(seeded(seed), "letter");
    const want = Object.keys(STATES).filter((c) => STATES[c][0] === r.letter).sort();
    assert.deepEqual([...r.targets].sort(), want);
  });

  test(`seed ${seed} store round = that store's states`, () => {
    const r = makeSpotRound(seeded(seed), "store");
    assert.deepEqual([...r.targets].sort(), [...r.store.states].sort());
  });
}

test("store rounds only use stores in 1-10 states", () => {
  assert.ok(SPOT_STORES.length > 10);
  for (const s of SPOT_STORES) assert.ok(s.states.length >= 1 && s.states.length <= 10, s.name);
  assert.ok(SPOT_STORES.some((s) => s.name === "Publix"));
  assert.ok(!SPOT_STORES.some((s) => s.name === "Walmart"));
  assert.equal(SPOT_STORES.length, STORES.filter((s) => s.states.length <= 10).length);
});

test("letter rounds only use letters some state starts with", () => {
  assert.deepEqual(SPOT_LETTERS, ["A", "C", "D", "F", "G", "H", "I", "K", "L", "M", "N", "O", "P", "R", "S", "T", "U", "V", "W"]);
});

test("a chosen store or letter is honored", () => {
  const publix = STORES.find((s) => s.name === "Publix");
  assert.equal(makeSpotRound(seeded(1), "store", publix).store, publix);
  assert.equal(makeSpotRound(seeded(1), "letter", "N").targets.length, 8);
});

// Every round type must build every line; an eager lookup once read r.store.name on a state round.
for (const seed of SEEDS) {
  for (const type of SPOT_TYPES) {
    test(`seed ${seed} ${type}: prompt, miss and done lines all build`, () => {
      const r = makeSpotRound(seeded(seed), type);
      const miss = Object.keys(STATES).find((c) => !r.targets.includes(c));
      for (const line of [spotPrompt(r), spotMissLine(r, miss), spotDoneLine(r)]) {
        assert.equal(typeof line, "string");
        assert.doesNotMatch(line, /undefined/);
      }
      assert.match(spotMissLine(r, miss), new RegExp(`^That's ${STATES[miss]}\\.`));
    });
  }
}

for (const [type, choice, done] of [
  ["state", "UT", "You found Utah!"],
  ["letter", "G", "Georgia is the only state that starts with G!"],
  ["letter", "K", "You found all 2 K states: Kansas and Kentucky!"],
  ["letter", "A", "You found all 4 A states: Alabama, Alaska, Arizona, and Arkansas!"],
  ["store", STORES.find((s) => s.name === "H-E-B"), "H-E-B is only in Texas!"],
  ["store", STORES.find((s) => s.name === "Publix"), "You lit up all 8 Publix states!"],
]) {
  test(`spotDoneLine ${type} ${choice.name ?? choice}`, () => {
    assert.equal(spotDoneLine(makeSpotRound(seeded(1), type, choice)), done);
  });
}

const round = { targets: ["FL", "GA"] };
for (const [found, code, want] of [
  [[], "FL", "hit"],
  [["FL"], "GA", "hit"],
  [["FL"], "FL", "again"],
  [[], "UT", "miss"],
  [["FL", "GA"], "TX", "miss"],
]) {
  test(`spotTap found=[${found}] tap ${code} → ${want}`, () => {
    assert.equal(spotTap(round, new Set(found), code), want);
  });
}
