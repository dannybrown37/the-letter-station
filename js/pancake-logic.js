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

export function pancakeSnack(rng = Math.random) {
  const letter = pick(ALPHABET.filter((l) => wordsForLetter(l, "snacks").length), rng);
  return { letter, word: pick(wordsForLetter(letter, "snacks"), rng) };
}

export const MAX_POINTS = PANS * 3;
