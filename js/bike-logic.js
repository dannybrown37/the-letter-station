import { ALPHABET, pick, shuffle, wordsForLetter } from "./logic.js";

export const TARGETS = 6;
export const MAX_CURVE = 0.004;
// Lane centers and flag reach are in road half-widths: -1 is the left edge, 1 the right.
export const LANES = [-0.6, 0, 0.6];
export const GATE_HALF = 0.24;
export const GATE_GAP = 56;
const EDGE = 0.92;
const GRIP = 8;

export const rideSpeed = (reduced) => (reduced ? 14 : 20);

function ease(curve, from, to, step) {
  for (let c = from; c !== to;) {
    c = to > c ? Math.min(to, c + step) : Math.max(to, c - step);
    curve.push(c);
  }
}

// Curvature per road segment. Ramps are capped so a bend never snaps in.
export function makeTrack(rng = Math.random, sections = 10) {
  const step = MAX_CURVE / 10;
  const curve = Array(30).fill(0);
  let now = 0;
  let side = rng() < 0.5 ? -1 : 1;
  for (let s = 0; s < sections; s++) {
    const bend = side * MAX_CURVE * (0.45 + rng() * 0.55);
    ease(curve, now, bend, step);
    for (let i = 20 + Math.floor(rng() * 30); i > 0; i--) curve.push(bend);
    now = bend;
    if (rng() < 0.4) {
      ease(curve, now, 0, step);
      for (let i = 10 + Math.floor(rng() * 15); i > 0; i--) curve.push(0);
      now = 0;
    }
    side = -side;
  }
  ease(curve, now, 0, step);
  for (let i = 0; i < 30; i++) curve.push(0);
  return curve;
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

export const bikeLetter = (rng = Math.random, except = null) =>
  pick(ALPHABET.filter((l) => l !== except && wordsForLetter(l, "snacks").length), rng);

export const bikeSnack = (letter, rng = Math.random) => pick(wordsForLetter(letter, "snacks"), rng);

export const START = 60;
export const rowZ = (i) => START + i * GATE_GAP;
export const FINISH_GAP = 28;

// Scenery follows distance: a clean run starts in town and crosses the finish in the mystic zone.
export const ZONES = ["town", "nature", "mystic"];
export const ZONE_EDGES = [120, 230];
export const BLEND = 40;

export function zoneMix(z) {
  const mix = { town: 0, nature: 0, mystic: 0 };
  let i = ZONE_EDGES.findIndex((edge) => z < edge + BLEND);
  if (i === -1) i = ZONES.length - 1;
  const t = i < ZONE_EDGES.length ? Math.max(0, Math.min(1, (z - ZONE_EDGES[i]) / BLEND)) : 0;
  mix[ZONES[i]] += 1 - t;
  if (t) mix[ZONES[i + 1]] += t;
  return mix;
}

export function zoneAt(z) {
  const mix = zoneMix(z);
  return ZONES.reduce((a, b) => (mix[b] > mix[a] ? b : a));
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

export const FEATURE_REPEAT = 4 * GATE_GAP;
export const FEATURES = [
  { id: "bridge", zone: "nature", from: 176, to: 200 },
  { id: "rainbow", zone: "mystic", from: 292, to: 330, repeat: true },
  { id: "cave", zone: "mystic", from: 350, to: 380, repeat: true },
];

export function featureAt(z) {
  return FEATURES.find((f) => {
    if (z < f.from) return false;
    const d = f.repeat ? (z - f.from) % FEATURE_REPEAT : z - f.from;
    return d < f.to - f.from;
  }) ?? null;
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
