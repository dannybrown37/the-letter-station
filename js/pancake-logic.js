import { WORDS } from "./data.js";
import { ALPHABET, pick, wordsForLetter } from "./logic.js";

export const PANS = 5;
export const PERIOD = 1800;

const BANDS = [["perfect", 0.05, 3], ["great", 0.1, 2], ["good", 0.18, 1]];

export const GRADES = {
  perfect: { label: "PERFECT!", line: "Perfect flip!", color: "#ffd23f" },
  great: { label: "Great!", line: "Great flip!", color: "#36c275" },
  good: { label: "Good!", line: "Good flip!", color: "#3fa9f5" },
  long: { label: "Too far!", line: "Whoa, too far! Try again.", color: "#c9b8ff" },
  short: { label: "Too short!", line: "A little more! Try again.", color: "#c9b8ff" },
};

// 0 → 1 → 0 so holding too long brings the line back down instead of failing.
export function meter(ms, period = PERIOD) {
  const phase = (ms % period) / period;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

// offset is in pan radii: |offset| <= 1 lands in the pan.
export function judge(power, target, scale = 1) {
  const err = power - target;
  const reach = BANDS.at(-1)[1] * scale;
  const band = BANDS.find(([, w]) => Math.abs(err) <= w * scale);
  const grade = band ? band[0] : err > 0 ? "long" : "short";
  return { grade, points: band ? band[2] : 0, landed: !!band, offset: err / reach };
}

// The last hop is the mouth: a smaller target.
export function makeCourse(rng = Math.random) {
  return Array.from({ length: PANS }, (_, i) => {
    const mouth = i === PANS - 1;
    return { target: 0.3 + rng() * 0.45, mouth, scale: mouth ? 0.7 : 1 - i * 0.05 };
  });
}

export const flipsFor = (power) => 1 + Math.floor(power * 2);

export const GAP = 6;
export const PAN_R = 1.1;
export const MOUTH_R = 0.75;
export const REST_Y = 0.2;
export const panPos = (i) => ({ x: i % 2 ? 1.1 : -1.1, y: 0, z: i * GAP });
export const mouthPos = () => ({ x: 0, y: 1.25, z: PANS * GAP });

// Misses are pushed well past the rim so they visibly land on the counter.
const MISS_OFFSET = 1.6;

export function planFlight(course, hop, power) {
  const c = course[hop];
  const result = judge(power, c.target, c.scale);
  const from = { ...panPos(hop), y: REST_Y };
  const goal = c.mouth ? mouthPos() : { ...panPos(hop + 1), y: REST_Y };
  const dx = goal.x - from.x, dz = goal.z - from.z;
  const len = Math.hypot(dx, dz);
  const reach = (c.mouth ? MOUTH_R : PAN_R) * 0.85;
  const off = result.landed ? result.offset : Math.sign(result.offset) * Math.max(Math.abs(result.offset), MISS_OFFSET);
  const end = { x: goal.x + (dx / len) * off * reach, y: result.landed ? goal.y : 0.04, z: goal.z + (dz / len) * off * reach };
  const flips = flipsFor(power) + (result.landed ? 0 : 0.5);
  return { from, end, result, flips, apex: 1.7 + power * 1.1, dur: 950 + flipsFor(power) * 120 };
}

export function flightPoint({ from, end, apex }, t) {
  return {
    x: from.x + (end.x - from.x) * t,
    y: from.y + (end.y - from.y) * t + apex * 4 * t * (1 - t),
    z: from.z + (end.z - from.z) * t,
  };
}

export function arcPoints(plan, n, project = (x, y, z) => ({ x, y, z })) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const { x, y, z } = flightPoint(plan, t);
    const p = project(x, y, z);
    if (p) out.push({ ...p, t });
  }
  return out;
}

export function pancakeSnack(rng = Math.random) {
  const letter = pick(ALPHABET.filter((l) => wordsForLetter(l, "snacks").length), rng);
  return { letter, word: pick(wordsForLetter(letter, "snacks"), rng) };
}

export const MAX_POINTS = PANS * 3;
