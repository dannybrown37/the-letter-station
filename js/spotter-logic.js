import { STATES, STORES } from "./data.js";
import { ALPHABET, pick } from "./logic.js";

const CODES = Object.keys(STATES);

export const SPOT_TYPES = ["state", "letter", "store"];
// Tapping 48 Hobby Lobby states would be a chore, so only small footprints.
export const SPOT_STORES = STORES.filter((s) => s.states.length >= 1 && s.states.length <= 10);
const statesWith = (letter) => CODES.filter((c) => STATES[c][0] === letter);
export const SPOT_LETTERS = ALPHABET.filter((l) => statesWith(l).length);

export function makeSpotRound(rng = Math.random, type = pick(SPOT_TYPES, rng), choice = undefined) {
  if (type === "letter") {
    const letter = choice ?? pick(SPOT_LETTERS, rng);
    return { type, letter, targets: statesWith(letter) };
  }
  if (type === "store") {
    const store = choice ?? pick(SPOT_STORES, rng);
    return { type, store, targets: [...store.states] };
  }
  const state = choice ?? pick(CODES, rng);
  return { type, state, targets: [state] };
}

const nameOf = (c) => STATES[c];
const andList = (xs) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`);

const PROMPTS = {
  state: (r) => `Find ${nameOf(r.state)}!`,
  letter: (r) => `Find every state that starts with ${r.letter}!`,
  store: (r) => `Light up every ${r.store.name} state!`,
};
export const spotPrompt = (r) => PROMPTS[r.type](r);

// A miss still names the state he tapped, so every tap teaches something.
const MISS_LINES = {
  state: (r, c) => `That's ${nameOf(c)}. Find ${nameOf(r.state)}!`,
  letter: (r, c) => `That's ${nameOf(c)}. It starts with ${nameOf(c)[0]}. Find ${r.letter}!`,
  store: (r, c) => `That's ${nameOf(c)}. It doesn't have ${r.store.name}. Keep looking!`,
};
export const spotMissLine = (r, code) => MISS_LINES[r.type](r, code);

const DONE_LINES = {
  state: (r) => `You found ${nameOf(r.state)}!`,
  letter: (r) => (r.targets.length === 1
    ? `${nameOf(r.targets[0])} is the only state that starts with ${r.letter}!`
    : `You found all ${r.targets.length} ${r.letter} states: ${andList(r.targets.map(nameOf))}!`),
  store: (r) => (r.targets.length === 1
    ? `${r.store.name} is only in ${nameOf(r.targets[0])}!`
    : `You lit up all ${r.targets.length} ${r.store.name} states!`),
};
export const spotDoneLine = (r) => DONE_LINES[r.type](r);

export function spotTap(round, found, code) {
  if (!round.targets.includes(code)) return "miss";
  return found.has(code) ? "again" : "hit";
}
