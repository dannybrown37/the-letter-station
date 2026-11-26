import { test } from "node:test";
import assert from "node:assert/strict";
import {
  meter, judge, makeCourse, flipsFor, pancakeSnack, PANS, GRADES,
  planFlight, flightPoint, arcPoints, panPos, mouthPos, PAN_R, MOUTH_R,
} from "../js/pancake-logic.js";
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

const COURSE = [
  { target: 0.5, mouth: false, scale: 1 },
  { target: 0.4, mouth: false, scale: 0.95 },
  { target: 0.6, mouth: true, scale: 0.7 },
];
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const goalOf = (hop) => (COURSE[hop].mouth ? mouthPos() : panPos(hop + 1));

for (const [hop, power] of [[0, 0.5], [0, 0.53], [0, 0.42], [0, 0.66], [0, 0.95], [0, 0.05], [1, 0.4], [1, 0.2], [2, 0.6], [2, 0.7]]) {
  test(`hop ${hop} power ${power}: arc is the real flight path`, () => {
    const plan = planFlight(COURSE, hop, power);
    const pts = arcPoints(plan, 12);
    assert.equal(pts.length, 12);
    const same = (a, b) => assert.ok(near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z), JSON.stringify([a, b]));
    same(pts[0], plan.from);
    same(pts.at(-1), plan.end);
    pts.forEach((p) => assert.deepEqual({ x: p.x, y: p.y, z: p.z }, flightPoint(plan, p.t)));
    assert.ok(Math.max(...pts.map((p) => p.y)) > Math.max(plan.from.y, plan.end.y), "it arcs up");
  });

  test(`hop ${hop} power ${power}: lands in the target iff judged a landing`, () => {
    const plan = planFlight(COURSE, hop, power);
    const radius = COURSE[hop].mouth ? MOUTH_R : PAN_R;
    assert.equal(plan.result.grade, judge(power, COURSE[hop].target, COURSE[hop].scale).grade);
    assert.equal(flat(plan.end, goalOf(hop)) <= radius, plan.result.landed);
    if (plan.result.grade === "perfect") assert.ok(flat(plan.end, goalOf(hop)) < radius / 3);
  });
}

test("more power lands further along the hop", () => {
  const dist = (p) => flat(planFlight(COURSE, 0, p).end, panPos(0));
  for (let p = 0.36; p < 0.64; p += 0.04) assert.ok(dist(p + 0.04) > dist(p), String(p));
});

test("arcPoints projects each point and drops ones the camera can't see", () => {
  const plan = planFlight(COURSE, 0, 0.5);
  const pts = arcPoints(plan, 10, (x, y, z) => (z < plan.end.z / 2 ? null : { x: x * 2, y, d: z }));
  assert.ok(pts.length > 0 && pts.length < 10);
  pts.forEach((p) => assert.ok(near(p.x, flightPoint(plan, p.t).x * 2)));
});

test("stronger flips spin more", () => {
  assert.equal(flipsFor(0.2), 1);
  assert.ok(flipsFor(0.9) > flipsFor(0.3));
});
