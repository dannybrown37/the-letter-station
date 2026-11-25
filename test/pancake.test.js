import { test } from "node:test";
import assert from "node:assert/strict";
import { meter, judge, makeCourse, flipsFor, pancakeSnack, PANS, GRADES } from "../js/pancake-logic.js";
import { firstLetter } from "../js/logic.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const SEEDS = [1, 2, 3, 42, 99, 1234, 777, 31337];

const near = (a, b) => Math.abs(a - b) < 1e-9;

for (const [t, period, want] of [
  [0, 2000, 0], [500, 2000, 0.5], [1000, 2000, 1], [1500, 2000, 0.5], [2000, 2000, 0], [2500, 2000, 0.5], [250, 1000, 0.5],
]) {
  test(`meter(${t}, ${period}) ping-pongs to ${want}`, () => assert.ok(near(meter(t, period), want), String(meter(t, period))));
}

for (const [power, target, scale, grade, points] of [
  [0.5, 0.5, 1, "perfect", 3],
  [0.54, 0.5, 1, "perfect", 3],
  [0.42, 0.5, 1, "great", 2],
  [0.65, 0.5, 1, "good", 1],
  [0.33, 0.5, 1, "good", 1],
  [0.75, 0.5, 1, "long", 0],
  [0.2, 0.5, 1, "short", 0],
  [0.65, 0.5, 0.7, "long", 0],
  [0.53, 0.5, 0.7, "perfect", 3],
]) {
  test(`judge(${power}, ${target}, ${scale}) is ${grade}`, () => {
    const r = judge(power, target, scale);
    assert.equal(r.grade, grade);
    assert.equal(r.points, points);
    assert.equal(r.landed, points > 0);
    assert.equal(Math.sign(r.offset), Math.sign(power - target));
    if (r.landed) assert.ok(Math.abs(r.offset) <= 1);
    else assert.ok(Math.abs(r.offset) > 1);
  });
}

test("every grade has a spoken line", () => {
  for (const g of ["perfect", "great", "good", "long", "short"]) assert.ok(GRADES[g].line);
});

for (const seed of SEEDS) {
  test(`seed ${seed}: course ends in the mouth, targets stay in the meter`, () => {
    const c = makeCourse(seeded(seed));
    assert.equal(c.length, PANS);
    c.forEach((hop, i) => {
      assert.ok(hop.target >= 0.3 && hop.target <= 0.75, String(hop.target));
      assert.equal(hop.mouth, i === PANS - 1);
      assert.ok(hop.scale <= 1 && hop.scale > 0.5);
    });
    assert.ok(c.at(-1).scale < c[0].scale, "the mouth is the hard one");
  });

  test(`seed ${seed}: snack word starts with the pancake letter`, () => {
    const s = pancakeSnack(seeded(seed));
    assert.equal(firstLetter(s.word), s.letter);
  });
}

test("stronger flips spin more", () => {
  assert.equal(flipsFor(0.2), 1);
  assert.ok(flipsFor(0.9) > flipsFor(0.3));
});
