import { test } from "node:test";
import assert from "node:assert/strict";
import {
  neighbors, travelMode, makeTripStop, TRIP_STOP_TYPES, GRAMMAR_RULES, makeGrammarQuestion, loadPassport, firstLetter,
  PASSPORT_ORDER, neighborLine, finishTrip,
} from "../js/logic.js";
import { STATES, STATE_NEIGHBORS, STORES } from "../js/data.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const CODES = Object.keys(STATES);
const SEEDS = [1, 2, 3, 42, 99, 1234];

test("STATE_NEIGHBORS covers all 50 states with real codes", () => {
  assert.deepEqual(Object.keys(STATE_NEIGHBORS).sort(), [...CODES].sort());
  for (const [c, ns] of Object.entries(STATE_NEIGHBORS)) {
    for (const n of ns) assert.ok(STATES[n], `${c} lists unknown ${n}`);
    assert.ok(!ns.includes(c), `${c} borders itself`);
  }
});

test("every border is listed from both sides", () => {
  for (const c of CODES) for (const n of neighbors(c)) assert.ok(neighbors(n).includes(c), `${c}→${n} but not ${n}→${c}`);
});

for (const [a, b, touching] of [
  ["FL", "GA", true], ["FL", "AL", true], ["UT", "NV", true], ["TN", "MO", true], ["ME", "NH", true],
  ["AZ", "CO", false], ["UT", "NM", false], ["FL", "SC", false], ["MI", "IL", false], ["AK", "WA", false],
]) {
  test(`${a} and ${b} ${touching ? "touch" : "don't touch"}`, () => {
    assert.equal(neighbors(a).includes(b), touching);
  });
}

test("Alaska and Hawaii have no neighbors", () => {
  assert.deepEqual(neighbors("AK"), []);
  assert.deepEqual(neighbors("HI"), []);
});

for (const [from, to, mode] of [[null, "FL", "start"], ["FL", "GA", "drive"], ["FL", "UT", "fly"], ["WA", "AK", "fly"], ["GA", "GA", "here"]]) {
  test(`travelMode ${from} → ${to} = ${mode}`, () => {
    assert.equal(travelMode(from, to), mode);
  });
}

test("every state can get every kind of stop", () => {
  for (const state of CODES) for (const type of TRIP_STOP_TYPES) {
    const q = makeTripStop(seeded(7), state, type);
    assert.equal(q.type, type, `${state} ${type}`);
  }
});

// User: multiple-choice "X starts with W, which word also does?" is self-evident. Typed letter answers stay.
test("no multiple-choice letter stops", () => {
  assert.deepEqual([...TRIP_STOP_TYPES].sort(), ["grammar", "store"]);
  const rng = seeded(9);
  for (let i = 0; i < 200; i++) assert.notEqual(makeTripStop(rng, "WA").type, "letter");
});

for (const seed of SEEDS) {
  test(`store stop seed ${seed}: only the answer is in the state`, () => {
    for (const state of CODES) {
      const q = makeTripStop(seeded(seed), state, "store");
      assert.equal(q.choices.length, 4);
      assert.ok(q.choices.includes(q.answer));
      assert.ok(q.answer.states.length < 50, "answer can't be in every state");
      assert.deepEqual(q.choices.filter((s) => s.states.includes(state)), [q.answer]);
    }
  });

  test(`random stop seed ${seed} picks a known type`, () => {
    assert.ok(TRIP_STOP_TYPES.includes(makeTripStop(seeded(seed), "TX").type));
  });
}

for (const rule of GRAMMAR_RULES) {
  test(`grammar ${rule}: one right sentence, distinct wrong ones, a tip`, () => {
    const rng = seeded(1);
    for (let i = 0; i < 6; i++) for (const state of CODES) {
      const q = makeGrammarQuestion(rng, state, rule);
      assert.equal(q.rule, rule);
      assert.ok(q.choices.includes(q.answer));
      assert.ok(q.choices.length >= 2 && q.choices.length <= 3);
      assert.equal(new Set(q.choices).size, q.choices.length);
      assert.match(q.tip, /^[A-Z0-9]/, `tips are sentences too: ${q.tip}`);
      assert.ok(!/undefined|null/.test(q.choices.join(" ")), q.choices.join(" | "));
    }
  });
}

test("grammar sentences never use a hotel", () => {
  const hotels = STORES.filter((s) => s.kind === "hotel").map((s) => s.name);
  const rng = seeded(2);
  for (let i = 0; i < 60; i++) for (const rule of GRAMMAR_RULES) {
    const q = makeGrammarQuestion(rng, "IL", rule);
    for (const name of hotels) assert.ok(!q.answer.includes(name), `${rule}: ${q.answer}`);
  }
});

for (const [rule, right, wrong] of [
  ["hasHave", /^Florida has /, /^Florida have /],
  ["capital", /Florida/, /florida/],
  ["question", /\?$/, /\.$/],
]) {
  test(`grammar ${rule} in Florida: right ${right}, wrong ${wrong}`, () => {
    const q = makeGrammarQuestion(seeded(5), "FL", rule);
    assert.match(q.answer, right);
    assert.ok(q.choices.filter((c) => c !== q.answer).every((c) => wrong.test(c)), q.choices.join(" | "));
  });
}

test("restaurants are never called stores", () => {
  const restaurants = STORES.filter((s) => s.kind === "restaurant").map((s) => s.name);
  const rng = seeded(3);
  for (let i = 0; i < 40; i++) for (const rule of GRAMMAR_RULES) for (const state of ["FL", "TX", "UT", "GA"]) {
    const q = makeGrammarQuestion(rng, state, rule);
    const text = `${q.answer} ${q.tip}`;
    for (const name of restaurants) {
      assert.ok(!text.includes(`${name} store`) && !text.includes(`${name} is one store`), text);
    }
  }
});

test("past tense: right sentence uses the real past form", () => {
  const rng = seeded(4);
  for (let i = 0; i < 60; i++) {
    const q = makeGrammarQuestion(rng, "FL", "past");
    assert.match(q.answer, /\b(went|drove|bought|saw|ate)\b/);
    assert.ok(q.choices.some((c) => /\b(goed|drived|buyed|seed|eated)\b/.test(c)));
  }
});

test("past tense never says 'ate' where there's no restaurant", () => {
  const rng = seeded(5);
  for (let i = 0; i < 60; i++) for (const state of ["AK", "HI", "ME", "VT"]) {
    assert.ok(!/\bate\b/.test(makeGrammarQuestion(rng, state, "past").answer));
  }
});

test("a/an: right sentence pairs an with a vowel word", () => {
  const rng = seeded(6);
  for (let i = 0; i < 60; i++) {
    const { answer } = makeGrammarQuestion(rng, "GA", "aAn");
    const [, art, word] = answer.match(/\b(a|an) (\w+)/);
    assert.equal(art, /^[aeiou]/i.test(word) ? "an" : "a", answer);
  }
});

test("all grammar rules show up over many rounds", () => {
  const seen = new Set();
  const rng = seeded(11);
  for (let i = 0; i < 300; i++) seen.add(makeGrammarQuestion(rng, "TX").rule);
  assert.deepEqual([...seen].sort(), [...GRAMMAR_RULES].sort());
});

for (const [raw, expected] of [
  [null, { stamps: [], at: null, trips: 0 }],
  ["junk", { stamps: [], at: null, trips: 0 }],
  [[], { stamps: [], at: null, trips: 0 }],
  [{ stamps: ["FL", "GA", "FL", "ZZ", 4], at: "GA" }, { stamps: ["FL", "GA"], at: "GA", trips: 0 }],
  [{ stamps: ["FL"], at: "ZZ" }, { stamps: ["FL"], at: null, trips: 0 }],
  [{ stamps: "FL", at: "FL" }, { stamps: [], at: "FL", trips: 0 }],
  [{ stamps: [], at: null, trips: 2 }, { stamps: [], at: null, trips: 2 }],
  [{ trips: -1 }, { stamps: [], at: null, trips: 0 }],
  [{ trips: 1.5 }, { stamps: [], at: null, trips: 0 }],
  [{ trips: "3" }, { stamps: [], at: null, trips: 0 }],
]) {
  test(`loadPassport(${JSON.stringify(raw)})`, () => {
    assert.deepEqual(loadPassport(raw), expected);
  });
}

test("PASSPORT_ORDER lists every state once, A to Z by name", () => {
  assert.equal(PASSPORT_ORDER.length, 50);
  assert.equal(new Set(PASSPORT_ORDER).size, 50);
  assert.deepEqual(PASSPORT_ORDER.slice(0, 4), ["AL", "AK", "AZ", "AR"]);
  assert.equal(PASSPORT_ORDER.at(-1), "WY");
});

for (const [code, line] of [
  ["FL", "Florida touches Alabama and Georgia."],
  ["ME", "Maine touches New Hampshire."],
  ["AR", "Arkansas touches Louisiana, Mississippi, Missouri, Oklahoma, Tennessee, and Texas."],
  ["HI", "Hawaii doesn't touch any other state. You have to fly!"],
]) {
  test(`neighborLine ${code}`, () => {
    assert.equal(neighborLine(code), line);
  });
}

test("finishTrip clears stamps, keeps the car, counts the trip", () => {
  const full = { stamps: Object.keys(STATES), at: "UT", trips: 1 };
  assert.deepEqual(finishTrip(full), { stamps: [], at: "UT", trips: 2 });
});

test("finishTrip does nothing before all 50", () => {
  const p = { stamps: ["FL"], at: "FL", trips: 0 };
  assert.equal(finishTrip(p), p);
});
