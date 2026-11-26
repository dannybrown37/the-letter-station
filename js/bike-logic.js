import { ALPHABET, pick, shuffle, wordsForLetter } from "./logic.js";

export const MAX_CURVE = 0.004;
// Lane centers and flag reach are in road half-widths: -1 is the left edge, 1 the right.
export const LANES = [-0.6, 0, 0.6];
export const GATE_HALF = 0.24;
export const GATE_GAP = 56;
export const HEARTS = 3;
export const MAX_SPEED_GAIN = 6;
const SPEED_RAMP = 3000;
const EDGE = 0.92;
const GRIP = 8;

// Creeps up over the first few minutes, capped so rows stay at least 2 seconds apart.
export function rideSpeed(reduced, z = 0) {
  const ramp = Math.max(0, Math.min(1, z / SPEED_RAMP));
  return reduced ? 14 + ramp * (MAX_SPEED_GAIN / 2) : 20 + ramp * MAX_SPEED_GAIN;
}

function ease(curve, from, to, step) {
  for (let c = from; c !== to;) {
    c = to > c ? Math.min(to, c + step) : Math.max(to, c - step);
    curve.push(c);
  }
}

// Curvature per road segment, made a bend at a time just ahead of the reader and dropped once
// far behind, so an endless ride uses a fixed amount of memory. Ramps are capped so a bend never snaps in.
export function makeTrackStream(rng = Math.random, keep = 512) {
  const step = MAX_CURVE / 10;
  const buf = Array(30).fill(0);
  let start = 0, now = 0, side = rng() < 0.5 ? -1 : 1;
  function section() {
    const bend = side * MAX_CURVE * (0.45 + rng() * 0.55);
    ease(buf, now, bend, step);
    for (let i = 20 + Math.floor(rng() * 30); i > 0; i--) buf.push(bend);
    now = bend;
    if (rng() < 0.4) {
      ease(buf, now, 0, step);
      for (let i = 10 + Math.floor(rng() * 15); i > 0; i--) buf.push(0);
      now = 0;
    }
    side = -side;
  }
  return {
    at(i) {
      while (start + buf.length <= i) section();
      const stale = i - keep - start;
      if (stale > keep) { buf.splice(0, stale); start += stale; }
      return buf[i - start] ?? 0;
    },
    get size() { return buf.length; },
  };
}

// The first two rows have one decoy so he learns the idea; then two. The target never sits where the last one did.
export function makeRow(letter, prevX, index, rng = Math.random) {
  const count = index < 2 ? 2 : 3;
  const targetX = pick(LANES.filter((x) => x !== prevX), rng);
  const decoyXs = shuffle(LANES.filter((x) => x !== targetX), rng).slice(0, count - 1);
  const decoys = shuffle(ALPHABET.filter((l) => l !== letter), rng);
  const gates = [
    { x: targetX, letter, target: true },
    ...decoyXs.map((x, i) => ({ x, letter: decoys[i], target: false })),
  ];
  return { gates: gates.sort((a, b) => a.x - b.x) };
}

// A tap on one half moves one lane that way; a lane is "passed" once he's a little past its center.
export function laneStep(x, dir) {
  const ahead = LANES.filter((l) => (dir < 0 ? l < x - 0.1 : l > x + 0.1));
  if (!ahead.length) return dir < 0 ? LANES[0] : LANES.at(-1);
  return dir < 0 ? Math.max(...ahead) : Math.min(...ahead);
}

export function judgeGate(row, bikeX) {
  const gate = row.gates.find((g) => Math.abs(g.x - bikeX) <= GATE_HALF) ?? null;
  return { kind: gate ? (gate.target ? "right" : "wrong") : "miss", gate };
}

export function steerToward(x, target, dt) {
  const goal = Math.max(-EDGE, Math.min(EDGE, target));
  return goal + (x - goal) * Math.exp(-GRIP * dt);
}

export function bikeLine(kind, letter, row, bikeX, hit) {
  if (kind === "right") return `${letter}! Great riding!`;
  if (kind === "wrong") return `That was ${hit.letter}. Find ${letter}!`;
  const target = row.gates.find((g) => g.target);
  return `${letter} was on the ${target.x < bikeX ? "left" : "right"}!`;
}

// Switch mode: one line per flag (a second say() would cut off the first), always ending on the next letter.
export function switchLine(kind, letter, hit, next) {
  const lead = kind === "right" ? `${letter}! ` : kind === "wrong" ? `That was ${hit.letter}. ` : "";
  return `${lead}Next is ${next}.`;
}

export const bikeLetter = (rng = Math.random, except = null) =>
  pick(ALPHABET.filter((l) => l !== except && wordsForLetter(l, "snacks").length), rng);

export const switchLetter = (prev, rng = Math.random) => pick(ALPHABET.filter((l) => l !== prev), rng);

export const bikeSnack = (letter, rng = Math.random) => pick(wordsForLetter(letter, "snacks"), rng);

export const START = 60;
export const rowZ = (i) => START + i * GATE_GAP;

export function makeRows({ letter, swap, rng = Math.random }) {
  let index = 0, prevX = null, prev = null;
  return () => {
    const target = swap && prev ? switchLetter(prev, rng) : letter;
    const row = makeRow(target, prevX, index, rng);
    prevX = row.gates.find((g) => g.target).x;
    prev = target;
    return { ...row, letter: target, z: rowZ(index), index: index++ };
  };
}

export const startRun = () => ({ caught: 0, hearts: HEARTS });

// Any row passed without the target costs a helmet: with three flags across three lanes,
// almost every miss goes through a wrong flag, so not counting those would make a run never end.
export const scoreRow = (run, kind) => (kind === "right"
  ? { ...run, caught: run.caught + 1 }
  : { ...run, hearts: Math.max(0, run.hearts - 1) });

export const runOver = (run) => run.hearts === 0;

export const endLine = (n) => (n ? `What a ride! ${n} letter${n === 1 ? "" : "s"}!` : "What a ride! Let's go again!");

const bestOf = (saved) => (saved && typeof saved === "object" ? saved : {});

export function readBest(saved, mode) {
  const n = bestOf(saved)[mode];
  return Number.isFinite(n) ? n : 0;
}

// Old saves were a plain number counting something else (first-try flags out of 6), so they start fresh.
export function saveBest(saved, mode, score) {
  const best = { ...bestOf(saved) };
  const isNew = score > readBest(saved, mode);
  if (isNew) best[mode] = score;
  return { best, isNew };
}

// Scenery follows distance: town → nature → mystic, then it keeps looping through night town,
// autumn forest, deep mystic and back, so a long ride keeps changing.
export const ZONES = ["town", "nature", "mystic", "night", "autumn", "deep"];
export const KIND_OF = { town: "town", night: "town", nature: "nature", autumn: "nature", mystic: "mystic", deep: "mystic" };
const KINDS = ["town", "nature", "mystic"];
const CYCLE = ["night", "autumn", "deep", "town", "nature", "mystic"];
const FIRST_LAP = [120, 230];
// A whole number of row gaps, so rows land at the same spots in every looped zone (never in a cave).
const ZONE_LEN = 4 * GATE_GAP;
export const BLEND = 40;

export const zoneStart = (n) => (n === 0 ? -Infinity : n <= FIRST_LAP.length ? FIRST_LAP[n - 1] : FIRST_LAP.at(-1) + (n - 2) * ZONE_LEN);
const zoneName = (n) => (n < 3 ? KINDS[n] : CYCLE[(n - 3) % CYCLE.length]);

function zoneIndex(z) {
  if (z < FIRST_LAP[0]) return 0;
  if (z < FIRST_LAP[1]) return 1;
  return 2 + Math.floor((z - FIRST_LAP[1]) / ZONE_LEN);
}

export function zoneMix(z) {
  const mix = Object.fromEntries(ZONES.map((k) => [k, 0]));
  const n = zoneIndex(z);
  const t = n ? Math.min(1, (z - zoneStart(n)) / BLEND) : 1;
  mix[zoneName(n)] += t;
  if (t < 1) mix[zoneName(n - 1)] += 1 - t;
  return mix;
}

export function zoneAt(z) {
  const mix = zoneMix(z);
  return ZONES.reduce((a, b) => (mix[b] > mix[a] ? b : a));
}

export function kindMix(mix) {
  const out = { town: 0, nature: 0, mystic: 0 };
  for (const z of ZONES) out[KIND_OF[z]] += mix[z];
  return out;
}

// u is a 0..1 hash: props mix stochastically through a blend, so the roadside changes a bit at a time.
export function propZone(weights, u) {
  let acc = 0;
  for (const z of ZONES) {
    acc += weights[z];
    if (u < acc) return z;
  }
  return ZONES.findLast((z) => weights[z] > 0);
}

// Offsets from the start of every zone of that kind (past the blend, clear of the rows).
export const FEATURES = [
  { id: "bridge", kind: "nature", from: 56, to: 80 },
  { id: "rainbow", kind: "mystic", from: 62, to: 100 },
  { id: "cave", kind: "mystic", from: 120, to: 150 },
];

export function featureAt(z) {
  const n = zoneIndex(z);
  if (!n) return null;
  const kind = KIND_OF[zoneName(n)], d = z - zoneStart(n);
  return FEATURES.find((f) => f.kind === kind && d >= f.from && d < f.to) ?? null;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export const mixColor = (a, b, t) => {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v + (y[i] - v) * t));
};

export const PALETTES = {
  town: {
    skyTop: "#1d2447", skyMid: "#4b3a6b", skyLow: "#e08a5f", fog: "#8a6478",
    grassA: "#3d7a3a", grassB: "#376f35", roadA: "#5a5d66", roadB: "#53565f",
    rumbleA: "#e8e8e8", rumbleB: "#d9534f", line: "#f2d16b", hillFar: "#3b3561", hillNear: "#2c2a4a",
  },
  nature: {
    skyTop: "#123a5c", skyMid: "#2f7a9a", skyLow: "#a8d8c8", fog: "#6f9c98",
    grassA: "#2f8a3b", grassB: "#287a33", roadA: "#6b5a45", roadB: "#62523f",
    rumbleA: "#9c8a6a", rumbleB: "#7d6c50", line: "#c9b98f", hillFar: "#3f6a7a", hillNear: "#2b4f45",
  },
  mystic: {
    skyTop: "#0b0826", skyMid: "#24124d", skyLow: "#5a2f8a", fog: "#4a3070",
    grassA: "#3a2a6e", grassB: "#33255f", roadA: "#3b3f6e", roadB: "#353965",
    rumbleA: "#7ff5e0", rumbleB: "#ff8af0", line: "#c9f7ff", hillFar: "#2a1d5c", hillNear: "#1c1442",
  },
  night: {
    skyTop: "#05081c", skyMid: "#101a3d", skyLow: "#26315e", fog: "#1e2747",
    grassA: "#1f4a2c", grassB: "#1b4227", roadA: "#3a3d48", roadB: "#34373f",
    rumbleA: "#c9c9d6", rumbleB: "#5b78d9", line: "#ffe07a", hillFar: "#1a2148", hillNear: "#121735",
  },
  autumn: {
    skyTop: "#2b4f7a", skyMid: "#c77d4a", skyLow: "#f2c48a", fog: "#b0805e",
    grassA: "#8a7a2e", grassB: "#7d6e29", roadA: "#6b5a45", roadB: "#62523f",
    rumbleA: "#d9a14a", rumbleB: "#b0482c", line: "#f2d16b", hillFar: "#7a4a3a", hillNear: "#5a3a2a",
  },
  deep: {
    skyTop: "#020410", skyMid: "#0c1f3d", skyLow: "#1d6b7a", fog: "#163a4a",
    grassA: "#0f3a4a", grassB: "#0c3240", roadA: "#2a2350", roadB: "#251f48",
    rumbleA: "#ffd23f", rumbleB: "#5affc8", line: "#ffe9a8", hillFar: "#0f2a45", hillNear: "#081a2e",
  },
};

export function blendPalette(weights) {
  const out = {};
  for (const key of Object.keys(PALETTES.town)) {
    const c = [0, 0, 0];
    for (const z of ZONES) rgb(PALETTES[z][key]).forEach((v, i) => { c[i] += v * weights[z]; });
    out[key] = hex(c);
  }
  return out;
}
