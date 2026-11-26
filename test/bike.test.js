import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeTrack, makeRow, judgeGate, steerToward, bikeLine, bikeSnack, bikeLetter, rideSpeed,
  LANES, GATE_HALF, GATE_GAP, TARGETS, MAX_CURVE,
  laneStep, FINISH_GAP, ZONES, ZONE_EDGES, BLEND, zoneMix, zoneAt, propZone, rowZ, FEATURES, FEATURE_REPEAT, featureAt, mixColor, PALETTES, blendPalette,
} from "../js/bike-logic.js";
import { ALPHABET, firstLetter } from "../js/logic.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const SEEDS = [1, 2, 3, 42, 99, 1234, 777, 31337];

for (const seed of SEEDS) {
  test(`seed ${seed}: track starts and ends straight, curves stay gentle and smooth`, () => {
    const t = makeTrack(seeded(seed));
    assert.ok(t.length >= 300, String(t.length));
    assert.equal(t[0], 0);
    assert.equal(t.at(-1), 0);
    for (let i = 1; i < t.length; i++) {
      assert.ok(Math.abs(t[i]) <= MAX_CURVE + 1e-9, `curve ${t[i]} at ${i}`);
      assert.ok(Math.abs(t[i] - t[i - 1]) <= MAX_CURVE / 8 + 1e-9, `jump at ${i}`);
    }
    assert.ok(t.some((c) => c > MAX_CURVE / 3) && t.some((c) => c < -MAX_CURVE / 3), "winds both ways");
  });

  test(`seed ${seed}: same seed, same track`, () => assert.deepEqual(makeTrack(seeded(seed)), makeTrack(seeded(seed))));

  test(`seed ${seed}: every row has exactly one target and no repeated letters or lanes`, () => {
    const rng = seeded(seed);
    let prev = null;
    for (let i = 0; i < 40; i++) {
      const row = makeRow("B", prev, i, rng);
      const targets = row.gates.filter((g) => g.target);
      assert.equal(targets.length, 1);
      assert.equal(targets[0].letter, "B");
      assert.equal(new Set(row.gates.map((g) => g.letter)).size, row.gates.length);
      assert.equal(new Set(row.gates.map((g) => g.x)).size, row.gates.length);
      row.gates.forEach((g) => assert.ok(LANES.includes(g.x) && ALPHABET.includes(g.letter)));
      if (prev !== null) assert.notEqual(targets[0].x, prev, "he has to steer every time");
      prev = targets[0].x;
    }
  });

  test(`seed ${seed}: snack starts with the ride letter`, () => {
    const letter = bikeLetter(seeded(seed));
    const s = bikeSnack(letter, seeded(seed + 1));
    assert.equal(firstLetter(s), letter);
  });
}

for (const [index, gates] of [[0, 2], [1, 2], [2, 3], [5, 3]]) {
  test(`row ${index} has ${gates} flags (starts easy)`, () => assert.equal(makeRow("A", null, index, seeded(7)).gates.length, gates));
}

const row = { gates: [{ x: LANES[0], letter: "B", target: true }, { x: LANES[2], letter: "M", target: false }] };
for (const [bikeX, kind, letter] of [
  [LANES[0], "right", "B"],
  [LANES[0] + GATE_HALF - 0.01, "right", "B"],
  [LANES[0] - GATE_HALF + 0.01, "right", "B"],
  [LANES[2], "wrong", "M"],
  [LANES[1], "miss", null],
  [LANES[0] + GATE_HALF + 0.01, "miss", null],
  [1, "miss", null],
]) {
  test(`judgeGate at x=${bikeX.toFixed(2)} is ${kind}`, () => {
    const r = judgeGate(row, bikeX);
    assert.equal(r.kind, kind);
    assert.equal(r.gate?.letter ?? null, letter);
  });
}

for (const [x, target, dt, want] of [
  [0, 1, 0, 0],
  [0, 0.5, 10, 0.5],
  [0, -0.5, 10, -0.5],
  [0, 5, 10, 0.92],
  [0, -5, 10, -0.92],
]) {
  test(`steerToward(${x}, ${target}, ${dt}) → ${want}`, () => assert.ok(Math.abs(steerToward(x, target, dt) - want) < 1e-9));
}

test("steering glides: a short step moves part way, never past the finger", () => {
  const x = steerToward(0, 0.8, 0.05);
  assert.ok(x > 0 && x < 0.8, String(x));
});

for (const [kind, gateX, bikeX, want] of [
  ["right", LANES[0], LANES[0], /^B!/],
  ["wrong", LANES[2], LANES[2], /That was M.*B/],
  ["miss", LANES[0], LANES[2], /left/],
  ["miss", LANES[2], LANES[0], /right/],
]) {
  test(`bikeLine ${kind} (target ${gateX}, bike ${bikeX}) says ${want}`, () => {
    const r = { gates: [{ x: gateX, letter: "B", target: true }, { x: LANES[1], letter: "M", target: false }, { x: gateX === LANES[2] ? LANES[0] : LANES[2], letter: "M", target: false }] };
    const hit = kind === "wrong" ? { letter: "M" } : null;
    assert.match(bikeLine(kind, "B", r, bikeX, hit), want);
  });
}

test("wrong lines never read a wrong flag as right", () => {
  assert.doesNotMatch(bikeLine("wrong", "B", row, LANES[2], { letter: "M" }), /yes|great|right!/i);
});

test("a run has a fixed number of targets and the rows are spaced for a kid", () => {
  assert.ok(TARGETS >= 5 && TARGETS <= 8);
  assert.ok(GATE_GAP / rideSpeed(false) >= 2, "at least 2 seconds between rows");
  assert.ok(rideSpeed(true) < rideSpeed(false), "reduced motion rides slower");
});

const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);

for (const [z, want] of [
  [0, { town: 1, nature: 0, mystic: 0 }],
  [ZONE_EDGES[0], { town: 1, nature: 0, mystic: 0 }],
  [ZONE_EDGES[0] + BLEND / 2, { town: 0.5, nature: 0.5, mystic: 0 }],
  [ZONE_EDGES[0] + BLEND, { town: 0, nature: 1, mystic: 0 }],
  [ZONE_EDGES[1] + BLEND / 4, { town: 0, nature: 0.75, mystic: 0.25 }],
  [ZONE_EDGES[1] + BLEND, { town: 0, nature: 0, mystic: 1 }],
  [5000, { town: 0, nature: 0, mystic: 1 }],
]) {
  test(`zoneMix(${z}) blends to ${JSON.stringify(want)}`, () => {
    const m = zoneMix(z);
    for (const k of ZONES) assert.ok(Math.abs(m[k] - want[k]) < 1e-9, `${k}: ${m[k]}`);
  });
}

test("zone weights always sum to 1 and move forward only", () => {
  let order = 0;
  for (let z = -10; z < 800; z += 3) {
    const m = zoneMix(z);
    assert.ok(Math.abs(sum(m) - 1) < 1e-9);
    const main = zoneAt(z);
    assert.ok(ZONES.indexOf(main) >= order, `went back to ${main} at ${z}`);
    order = ZONES.indexOf(main);
  }
});

test("a clean run (no misses) passes all three zones and finishes in the mystic one", () => {
  const rows = Array.from({ length: TARGETS }, (_, i) => rowZ(i));
  assert.equal(zoneAt(rows[0]), "town");
  assert.ok(rows.some((z) => zoneAt(z) === "nature"));
  assert.equal(zoneAt(rows.at(-1)), "mystic");
});

for (const [weights, u, want] of [
  [{ town: 1, nature: 0, mystic: 0 }, 0.99, "town"],
  [{ town: 0.5, nature: 0.5, mystic: 0 }, 0.49, "town"],
  [{ town: 0.5, nature: 0.5, mystic: 0 }, 0.51, "nature"],
  [{ town: 0, nature: 0.25, mystic: 0.75 }, 0.2, "nature"],
  [{ town: 0, nature: 0.25, mystic: 0.75 }, 0.3, "mystic"],
  [{ town: 0, nature: 0, mystic: 1 }, 0, "mystic"],
]) {
  test(`propZone(${JSON.stringify(weights)}, ${u}) = ${want}`, () => assert.equal(propZone(weights, u), want));
}

for (const [z, want] of [
  [0, null], [rowZ(0), null],
  [FEATURES[0].from + 1, "bridge"], [FEATURES[1].from + 1, "rainbow"], [FEATURES[2].to - 1, "cave"],
  [FEATURES[2].to + 1, null],
  [FEATURES[1].from + 1 + FEATURE_REPEAT, "rainbow"], [FEATURES[2].from + 1 + FEATURE_REPEAT * 2, "cave"],
]) {
  test(`featureAt(${z}) = ${want}`, () => assert.equal(featureAt(z)?.id ?? null, want));
}

test("each feature sits in its own zone", () => {
  for (const f of FEATURES) assert.equal(zoneMix((f.from + f.to) / 2)[f.zone], 1, f.id);
});

test("no flag row lands on a bridge or in a cave (he needs to see the flags)", () => {
  for (let i = 0; i < 30; i++) assert.equal(featureAt(rowZ(i)), null, `row ${i} at ${rowZ(i)}`);
});

for (const [a, b, t, want] of [
  ["#000000", "#ffffff", 0, "#000000"],
  ["#000000", "#ffffff", 1, "#ffffff"],
  ["#000000", "#ffffff", 0.5, "#808080"],
  ["#ff0000", "#0000ff", 0.25, "#bf0040"],
]) {
  test(`mixColor(${a}, ${b}, ${t}) = ${want}`, () => assert.equal(mixColor(a, b, t), want));
}

test("every zone palette has the same color keys", () => {
  const keys = Object.keys(PALETTES.town).sort();
  for (const z of ZONES) assert.deepEqual(Object.keys(PALETTES[z]).sort(), keys);
  assert.deepEqual(blendPalette({ town: 1, nature: 0, mystic: 0 }), PALETTES.town);
});

for (const [x, dir, want] of [
  [0, -1, LANES[0]], [0, 1, LANES[2]],
  [LANES[0], -1, LANES[0]], [LANES[2], 1, LANES[2]],
  [LANES[2], -1, 0], [LANES[0], 1, 0],
  [0.05, -1, LANES[0]], [-0.05, 1, LANES[2]],
  [0.3, -1, 0], [0.3, 1, LANES[2]],
]) {
  test(`a tap on the ${dir < 0 ? "left" : "right"} half from x=${x} heads to lane ${want}`, () => assert.equal(laneStep(x, dir), want));
}

test("finish line sits a short roll past the last flag, fully mystic", () => {
  assert.ok(FINISH_GAP > 10 && FINISH_GAP < GATE_GAP);
  assert.equal(zoneMix(rowZ(TARGETS - 1) + FINISH_GAP).mystic, 1);
});

for (const seed of SEEDS) {
  test(`seed ${seed}: New letter never repeats the current one`, () => {
    const rng = seeded(seed);
    for (const l of ["B", "M", "S"]) assert.notEqual(bikeLetter(rng, l), l);
  });
}

test("the miss hint is short enough to finish before the next row", () => {
  const line = bikeLine("miss", "B", row, LANES[2], null);
  assert.ok(line.split(" ").length <= 6, line);
});
