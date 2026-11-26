import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeTrackStream, makeRow, makeRows, judgeGate, steerToward, bikeLine, switchLine, bikeSnack, bikeLetter, switchLetter, rideSpeed,
  LANES, GATE_HALF, GATE_GAP, MAX_CURVE, HEARTS, MAX_SPEED_GAIN, startRun, scoreRow, runOver, endLine, readBest, saveBest,
  laneStep, ZONES, KIND_OF, BLEND, zoneStart, zoneMix, zoneAt, kindMix, propZone, rowZ, FEATURES, featureAt, mixColor, PALETTES, blendPalette,
} from "../js/bike-logic.js";
import { ALPHABET, firstLetter } from "../js/logic.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const SEEDS = [1, 2, 3, 42, 99, 1234, 777, 31337];
const LONG = 20000;

for (const seed of SEEDS) {
  test(`seed ${seed}: endless track starts straight, stays gentle and smooth for ${LONG} segments`, () => {
    const t = makeTrackStream(seeded(seed));
    assert.equal(t.at(0), 0);
    let prev = 0, left = false, right = false;
    for (let i = 1; i < LONG; i++) {
      const c = t.at(i);
      assert.ok(Math.abs(c) <= MAX_CURVE + 1e-9, `curve ${c} at ${i}`);
      assert.ok(Math.abs(c - prev) <= MAX_CURVE / 8 + 1e-9, `jump at ${i}`);
      left ||= c < -MAX_CURVE / 3;
      right ||= c > MAX_CURVE / 3;
      prev = c;
    }
    assert.ok(left && right, "winds both ways");
  });

  test(`seed ${seed}: same seed, same endless track`, () => {
    const [a, b] = [makeTrackStream(seeded(seed)), makeTrackStream(seeded(seed))];
    for (let i = 0; i < 3000; i += 7) assert.equal(a.at(i), b.at(i));
  });

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

  test(`seed ${seed}: Switch rows change the target every flag and always carry it`, () => {
    const next = makeRows({ letter: "B", swap: true, rng: seeded(seed) });
    let prev = null;
    for (let i = 0; i < 200; i++) {
      const row = next();
      const targets = row.gates.filter((g) => g.target);
      assert.equal(targets.length, 1);
      assert.equal(targets[0].letter, row.letter);
      assert.equal(row.gates.filter((g) => g.letter === row.letter).length, 1, "only the target shows the target letter");
      assert.equal(row.z, rowZ(i));
      if (i === 0) assert.equal(row.letter, "B", "the first target is the one announced at the start");
      else assert.notEqual(row.letter, prev, "a new letter every flag");
      prev = row.letter;
    }
  });

  test(`seed ${seed}: one-letter rows keep the same target`, () => {
    const next = makeRows({ letter: "M", swap: false, rng: seeded(seed) });
    for (let i = 0; i < 50; i++) assert.equal(next().letter, "M");
  });

  test(`seed ${seed}: switchLetter never repeats the last letter`, () => {
    const rng = seeded(seed);
    for (const l of ALPHABET) {
      const n = switchLetter(l, rng);
      assert.notEqual(n, l);
      assert.ok(ALPHABET.includes(n));
    }
  });
}

for (const [index, gates] of [[0, 2], [1, 2], [2, 3], [5, 3], [500, 3]]) {
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

for (const [kind, hit, want] of [
  ["right", null, /^B! Next is K\.$/],
  ["wrong", { letter: "M" }, /^That was M\. Next is K\.$/],
  ["miss", null, /^Next is K\.$/],
]) {
  test(`switchLine ${kind} names the next letter in one line`, () => assert.match(switchLine(kind, "B", hit, "K"), want));
}

test("wrong lines never read a wrong flag as right", () => {
  assert.doesNotMatch(bikeLine("wrong", "B", row, LANES[2], { letter: "M" }), /yes|great|right!/i);
  assert.doesNotMatch(switchLine("wrong", "B", { letter: "M" }, "K"), /yes|great|right!/i);
});

test("rows are spaced for a kid, even at top speed", () => {
  for (const reduced of [false, true]) {
    const top = rideSpeed(reduced, 1e9);
    assert.ok(GATE_GAP / top >= 2, `at least 2 seconds between rows (reduced=${reduced})`);
  }
});

for (const reduced of [false, true]) {
  test(`speed creeps up with distance, capped (reduced=${reduced})`, () => {
    let prev = rideSpeed(reduced, 0);
    assert.equal(prev, reduced ? 14 : 20);
    for (let z = 0; z <= 1e6; z += 997) {
      const s = rideSpeed(reduced, z);
      assert.ok(s >= prev, `slowed down at ${z}`);
      prev = s;
    }
    assert.ok(rideSpeed(reduced, 2000) > rideSpeed(reduced, 0), "it does speed up");
    assert.ok(prev - rideSpeed(reduced, 0) <= MAX_SPEED_GAIN + 1e-9);
  });
}

test("reduced motion rides slower at every distance", () => {
  for (const z of [0, 500, 3000, 1e6]) assert.ok(rideSpeed(true, z) < rideSpeed(false, z));
});

test(`a run starts with ${HEARTS} helmets and no letters`, () => {
  assert.deepEqual(startRun(), { caught: 0, hearts: HEARTS });
  assert.equal(HEARTS, 3);
});

for (const [kinds, caught, hearts, over] of [
  [["right"], 1, 3, false],
  [["right", "right", "right"], 3, 3, false],
  [["miss"], 0, 2, false],
  [["wrong"], 0, 2, false],
  [["wrong", "right", "miss"], 1, 1, false],
  [["miss", "wrong", "miss"], 0, 0, true],
  [["right", "miss", "right", "wrong", "right", "miss"], 3, 0, true],
]) {
  test(`after ${kinds.join(", ")}: ${caught} letters, ${hearts} helmets, over=${over}`, () => {
    const run = kinds.reduce(scoreRow, startRun());
    assert.equal(run.caught, caught);
    assert.equal(run.hearts, hearts);
    assert.equal(runOver(run), over);
  });
}

test("helmets never go below zero", () => assert.equal(scoreRow({ caught: 2, hearts: 0 }, "miss").hearts, 0));

for (const [n, want] of [
  [23, "What a ride! 23 letters!"],
  [1, "What a ride! 1 letter!"],
  [0, "What a ride! Let's go again!"],
]) {
  test(`endLine(${n}) = ${want}`, () => assert.equal(endLine(n), want));
}

for (const [saved, mode, want] of [
  [null, "letter", 0],
  [7, "letter", 0],
  ["junk", "switch", 0],
  [{ letter: 12 }, "letter", 12],
  [{ letter: 12 }, "switch", 0],
  [{ letter: "x" }, "letter", 0],
]) {
  test(`readBest(${JSON.stringify(saved)}, ${mode}) = ${want}`, () => assert.equal(readBest(saved, mode), want));
}

for (const [saved, mode, score, best, isNew] of [
  [null, "letter", 5, { letter: 5 }, true],
  [{ letter: 9 }, "letter", 5, { letter: 9 }, false],
  [{ letter: 9 }, "letter", 9, { letter: 9 }, false],
  [{ letter: 9 }, "switch", 4, { letter: 9, switch: 4 }, true],
  [6, "letter", 3, { letter: 3 }, true],
  [null, "switch", 0, {}, false],
]) {
  test(`saveBest(${JSON.stringify(saved)}, ${mode}, ${score}) → ${JSON.stringify(best)} new=${isNew}`, () => {
    assert.deepEqual(saveBest(saved, mode, score), { best, isNew });
  });
}

const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);
const only = (o) => Object.fromEntries(ZONES.map((z) => [z, o[z] ?? 0]));

for (const [z, want] of [
  [0, { town: 1 }],
  [zoneStart(1), { town: 1 }],
  [zoneStart(1) + BLEND / 2, { town: 0.5, nature: 0.5 }],
  [zoneStart(1) + BLEND, { nature: 1 }],
  [zoneStart(2) + BLEND / 4, { nature: 0.75, mystic: 0.25 }],
  [zoneStart(2) + BLEND, { mystic: 1 }],
  [zoneStart(3) + BLEND / 2, { mystic: 0.5, night: 0.5 }],
  [zoneStart(4) + BLEND, { autumn: 1 }],
  [zoneStart(5) + BLEND, { deep: 1 }],
  [zoneStart(6) + BLEND / 2, { deep: 0.5, town: 0.5 }],
]) {
  test(`zoneMix(${z}) blends to ${JSON.stringify(want)}`, () => {
    const m = zoneMix(z);
    const w = only(want);
    for (const k of ZONES) assert.ok(Math.abs(m[k] - w[k]) < 1e-9, `${k}: ${m[k]}`);
  });
}

test("the first lap is town → nature → mystic, then it loops through night, autumn and deep mystic", () => {
  const seen = [];
  for (let n = 0; n < 15; n++) seen.push(zoneAt(zoneStart(n) + BLEND + 1));
  assert.deepEqual(seen.slice(0, 9), ["town", "nature", "mystic", "night", "autumn", "deep", "town", "nature", "mystic"]);
  assert.deepEqual(seen.slice(9), seen.slice(3, 9), "keeps cycling");
});

test("zone weights sum to 1 and a zone never repeats back to back, out to a million units", () => {
  let last = zoneAt(0);
  for (let z = -10; z < 1e6; z += 13) {
    const m = zoneMix(z);
    assert.ok(Math.abs(sum(m) - 1) < 1e-9, `sum at ${z}`);
    assert.ok(Object.values(m).filter((w) => w > 0).length <= 2, "at most two zones blend");
    const main = zoneAt(z);
    assert.ok(ZONES.includes(main));
    last = main;
  }
  assert.ok(ZONES.includes(last));
  for (let n = 1; n < 500; n++) assert.notEqual(zoneAt(zoneStart(n) + BLEND), zoneAt(zoneStart(n) - 1), `zone ${n}`);
});

test("every zone shows up in a long ride", () => {
  const seen = new Set();
  for (let z = 0; z < 4000; z += 10) seen.add(zoneAt(z));
  assert.deepEqual([...seen].sort(), [...ZONES].sort());
});

test("a short ride still sees town, nature and mystic in order", () => {
  assert.equal(zoneAt(rowZ(0)), "town");
  assert.ok([1, 2, 3].some((i) => zoneAt(rowZ(i)) === "nature"));
  assert.equal(zoneAt(rowZ(5)), "mystic");
});

test("each zone is a look on one of the three prop sets", () => {
  for (const z of ZONES) assert.ok(["town", "nature", "mystic"].includes(KIND_OF[z]), z);
  assert.deepEqual(kindMix({ ...only({}), night: 0.25, autumn: 0.75 }), { town: 0.25, nature: 0.75, mystic: 0 });
});

for (const [weights, u, want] of [
  [only({ town: 1 }), 0.99, "town"],
  [only({ town: 0.5, nature: 0.5 }), 0.49, "town"],
  [only({ town: 0.5, nature: 0.5 }), 0.51, "nature"],
  [only({ nature: 0.25, mystic: 0.75 }), 0.2, "nature"],
  [only({ nature: 0.25, mystic: 0.75 }), 0.3, "mystic"],
  [only({ mystic: 1 }), 0, "mystic"],
  [only({ deep: 0.5, town: 0.5 }), 0.7, "deep"],
  [only({ night: 1 }), 0.999, "night"],
]) {
  test(`propZone(${JSON.stringify(weights)}, ${u}) = ${want}`, () => assert.equal(propZone(weights, u), want));
}

for (const [z, want] of [
  [0, null], [rowZ(0), null],
  [zoneStart(1) + FEATURES[0].from + 1, "bridge"],
  [zoneStart(2) + FEATURES[1].from + 1, "rainbow"],
  [zoneStart(2) + FEATURES[2].to - 1, "cave"],
  [zoneStart(2) + FEATURES[2].to + 1, null],
  [zoneStart(3) + FEATURES[1].from + 1, null],
  [zoneStart(4) + FEATURES[0].from + 1, "bridge"],
  [zoneStart(5) + FEATURES[1].from + 1, "rainbow"],
  [zoneStart(5) + FEATURES[2].from + 1, "cave"],
  [zoneStart(6000 * 6 + 2) + FEATURES[2].from + 1, "cave"],
]) {
  test(`featureAt(${z}) = ${want}`, () => assert.equal(featureAt(z)?.id ?? null, want));
}

test("features sit fully inside a zone of their own kind", () => {
  for (let n = 1; n < 40; n++) {
    const zone = zoneAt(zoneStart(n) + BLEND);
    for (const f of FEATURES) {
      if (KIND_OF[zone] !== f.kind) continue;
      const z = zoneStart(n) + (f.from + f.to) / 2;
      assert.equal(zoneMix(z)[zone], 1, `${f.id} in zone ${n}`);
      assert.ok(zoneStart(n) + f.to < zoneStart(n + 1), `${f.id} fits in zone ${n}`);
    }
  }
});

test("no flag row ever lands on a bridge or in a cave (he needs to see the flags)", () => {
  for (let i = 0; i < 3000; i++) {
    const f = featureAt(rowZ(i));
    assert.ok(f?.id !== "bridge" && f?.id !== "cave", `row ${i} at ${rowZ(i)} on ${f?.id}`);
  }
});

for (const [a, b, t, want] of [
  ["#000000", "#ffffff", 0, "#000000"],
  ["#000000", "#ffffff", 1, "#ffffff"],
  ["#000000", "#ffffff", 0.5, "#808080"],
  ["#ff0000", "#0000ff", 0.25, "#bf0040"],
]) {
  test(`mixColor(${a}, ${b}, ${t}) = ${want}`, () => assert.equal(mixColor(a, b, t), want));
}

test("every zone has a palette with the same color keys", () => {
  const keys = Object.keys(PALETTES.town).sort();
  assert.deepEqual(Object.keys(PALETTES).sort(), [...ZONES].sort());
  for (const z of ZONES) {
    assert.deepEqual(Object.keys(PALETTES[z]).sort(), keys);
    assert.deepEqual(blendPalette(only({ [z]: 1 })), PALETTES[z]);
  }
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

// Mirrors the frame loop: spawn rows ahead, drop the ones behind, read the track around the camera.
for (const swap of [false, true]) {
  test(`a ${swap ? "Switch" : "one-letter"} ride of 100,000 units keeps memory flat`, () => {
    const AHEAD = 190, DRAW = 172;
    const track = makeTrackStream(seeded(5));
    const next = makeRows({ letter: "B", swap, rng: seeded(6) });
    const rows = [];
    let maxRows = 0, maxTrack = 0, upcoming = next();
    for (let camZ = 0; camZ < 100000; camZ += 0.37) {
      while (upcoming.z < camZ + AHEAD) { rows.push(upcoming); upcoming = next(); }
      while (rows.length && rows[0].z < camZ - 2) rows.shift();
      const base = Math.floor(camZ);
      for (const n of [0, DRAW >> 1, DRAW]) assert.ok(Math.abs(track.at(base + n)) <= MAX_CURVE + 1e-9);
      maxRows = Math.max(maxRows, rows.length);
      maxTrack = Math.max(maxTrack, track.size);
    }
    assert.ok(maxRows <= 5, `rows window ${maxRows}`);
    assert.ok(maxTrack <= 2000, `track buffer ${maxTrack}`);
  });
}
