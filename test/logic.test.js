import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstLetter, wordsForLetter, playableLetters, makeLetterQuestion,
  makeStoreQuestion, makeYesNoQuestion, storesInState, parseYouTubeId, shuffle, checkLetterAnswer,
  isDeadThumb, mergeVideos,
} from "../js/logic.js";
import { STATES, STORES, WORDS, KINDS, SING_VIDEOS, LBB_CHARACTERS, SING_CHARACTERS } from "../js/data.js";

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

for (const [word, expected] of [["Publix", "P"], ["7-Eleven", "E"], ["  'tis", "T"], ["", ""], ["123", ""]]) {
  test(`firstLetter(${JSON.stringify(word)}) = ${expected}`, () => {
    assert.equal(firstLetter(word), expected);
  });
}

for (const [letter, category, mustInclude] of [["P", "stores", "Publix"], ["T", "states", "Texas"], ["G", "snacks", "Goldfish"]]) {
  test(`wordsForLetter ${letter} ${category} includes ${mustInclude}`, () => {
    const words = wordsForLetter(letter, category);
    assert.ok(words.includes(mustInclude));
    assert.ok(words.every((w) => firstLetter(w) === letter));
  });
}

test("playableLetters for states excludes letters with no state", () => {
  const letters = playableLetters("states");
  assert.ok(letters.includes("N"));
  assert.ok(!letters.includes("Z"));
});

for (const seed of [1, 2, 3, 42, 99, 1234]) {
  test(`makeLetterQuestion seed ${seed}: exactly one answer starts with the letter`, () => {
    const q = makeLetterQuestion(seeded(seed));
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert.equal(q.choices.filter((c) => firstLetter(c) === q.letter).length, 1);
    assert.equal(firstLetter(q.answer), q.letter);
  });

  test(`makeStoreQuestion seed ${seed}: exactly one choice is right`, () => {
    const q = makeStoreQuestion(seeded(seed));
    const isRight = (code) => q.store.states.includes(code) === q.has;
    assert.equal(q.choices.length, 4);
    assert.equal(q.choices.filter(isRight).length, 1);
    assert.ok(isRight(q.answer));
  });

  test(`makeYesNoQuestion seed ${seed}: answer matches data`, () => {
    const q = makeYesNoQuestion(seeded(seed));
    assert.equal(q.answer, q.store.states.includes(q.state));
  });
}

const storeNamed = (name) => STORES.find((s) => s.name === name);

for (const [name, has] of [["Publix", true], ["Costco", false], ["Trader Joe's", false]]) {
  test(`makeStoreQuestion ${name} asks has=${has}`, () => {
    for (const seed of [1, 2, 3]) {
      const q = makeStoreQuestion(seeded(seed), storeNamed(name));
      assert.equal(q.has, has);
      assert.equal(q.choices.filter((c) => q.store.states.includes(c) === has).length, 1);
    }
  });
}

test("makeStoreQuestion never picks a store that is in every state", () => {
  for (let seed = 1; seed < 300; seed++) {
    assert.ok(makeStoreQuestion(seeded(seed)).store.states.length < 50);
  }
});

for (const name of ["Walmart", "Target", "Hobby Lobby", "Stater Bros", "Cava", "Culver's", "Vale", "4 Rivers BBQ", "R&R BBQ"]) {
  test(`data includes ${name}`, () => assert.ok(storeNamed(name)));
}

test("makeLetterQuestion respects a fixed letter and category", () => {
  const q = makeLetterQuestion(seeded(5), { letter: "W", category: "restaurants" });
  assert.equal(q.letter, "W");
  assert.equal(q.category, "restaurants");
  assert.ok(WORDS.restaurants.includes(q.answer));
});

for (const [code, has, hasNot] of [["FL", "Publix", "H-E-B"], ["TX", "H-E-B", "Publix"]]) {
  test(`storesInState ${code}`, () => {
    const names = storesInState(code).map((s) => s.name);
    assert.ok(names.includes(has));
    assert.ok(!names.includes(hasNot));
  });
}

for (const [url, id] of [
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://youtu.be/dQw4w9WgXcQ?t=5", "dQw4w9WgXcQ"],
  ["https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://evil.com/watch?v=dQw4w9WgXcQ", null],
  ["not a url", null],
  ["https://www.youtube.com/watch?v=<script>", null],
]) {
  test(`parseYouTubeId ${url}`, () => assert.equal(parseYouTubeId(url), id));
}

test("shuffle keeps all items", () => {
  assert.deepEqual(shuffle([1, 2, 3, 4], seeded(7)).sort(), [1, 2, 3, 4]);
});

test("data: every store has a known kind and a valid Wikipedia title if any", () => {
  for (const store of STORES) {
    assert.ok(KINDS[store.kind], `${store.name}: kind ${store.kind}`);
    if (store.wiki) assert.match(store.wiki, /^[^\s/]+$/, `${store.name}: wiki`);
  }
});

for (const [kind, word] of [["grocery", "Grocery"], ["gas", "Gas"], ["restaurant", "Restaurant"]]) {
  test(`KINDS.${kind} label mentions ${word}`, () => assert.match(KINDS[kind].label, new RegExp(word)));
}

test("data: every store state code is a real state", () => {
  for (const store of STORES) for (const code of store.states) assert.ok(STATES[code], `${store.name}: ${code}`);
});


for (const [input, letter, category, status, word] of [
  ["lowes", "L", "stores", "right", "Lowe's"],
  ["  LOWE'S ", "L", "stores", "right", "Lowe's"],
  ["chickfila", "C", "restaurants", "right", "Chick-fil-A"],
  ["chick fil a", "C", "restaurants", "right", "Chick-fil-A"],
  ["Texas", "T", "states", "right", "Texas"],
  ["Lollipop Land", "L", "stores", "unknown", null],
  ["Publix", "L", "stores", "wrongLetter", null],
  ["", "L", "stores", "empty", null],
  ["  ", "L", "stores", "empty", null],
  ["Texas", "T", "stores", "unknown", null],
]) {
  test(`checkLetterAnswer(${JSON.stringify(input)}, ${letter}, ${category}) = ${status}`, () => {
    assert.deepEqual(checkLetterAnswer(input, letter, category), { status, word });
  });
}

const squashed = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
for (const category of ["stores", "restaurants", "snacks"]) {
  test(`WORDS.${category} has no duplicates`, () => {
    const keys = WORDS[category].map(squashed);
    assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
  });
  test(`WORDS.${category} has 3+ answers for at least 22 letters`, () => {
    const rich = playableLetters(category).filter((l) => wordsForLetter(l, category).length >= 3);
    assert.ok(rich.length >= 22, `only ${rich.length}: ${rich.join("")}`);
  });
}

test("every chain in STORES is a Letter Train answer", () => {
  const missing = STORES.filter((s) => /^[a-z]/i.test(s.name))
    .filter((s) => !WORDS[s.kind === "restaurant" ? "restaurants" : "stores"].includes(s.name))
    .map((s) => s.name);
  assert.deepEqual(missing, []);
});

for (const [width, height, dead] of [[120, 90, true], [320, 180, false], [480, 360, false], [0, 0, false]]) {
  test(`isDeadThumb(${width}x${height}) = ${dead}`, () => assert.equal(isDeadThumb(width, height), dead));
}

const vid = (id, title = id) => ({ id, title, questions: [] });
for (const [name, saved, pack, expectedIds] of [
  ["adds all to empty", [], [vid("a"), vid("b")], ["a", "b"]],
  ["skips ones already saved, keeps saved first", [vid("b", "Mine")], [vid("a"), vid("b")], ["b", "a"]],
  ["no-op when all saved", [vid("a")], [vid("a")], ["a"]],
]) {
  test(`mergeVideos: ${name}`, () => {
    const merged = mergeVideos(saved, pack);
    assert.deepEqual(merged.map((v) => v.id), expectedIds);
    for (const v of saved) assert.equal(merged.find((m) => m.id === v.id), v);
  });
}

test("data: SING_VIDEOS have valid, unique YouTube ids and titles", () => {
  assert.ok(SING_VIDEOS.length > 0);
  for (const v of SING_VIDEOS) {
    assert.equal(parseYouTubeId(v.id), v.id, v.title);
    assert.ok(v.title && v.title.length <= 60, v.id);
    assert.deepEqual(v.questions, []);
  }
  assert.equal(new Set(SING_VIDEOS.map((v) => v.id)).size, SING_VIDEOS.length);
});

for (const [label, list] of [["LBB_CHARACTERS", LBB_CHARACTERS], ["SING_CHARACTERS", SING_CHARACTERS]]) test(`${label} profiles are complete and unique`, () => {
  assert.ok(list.length >= 6);
  assert.equal(new Set(list.map((c) => c.id)).size, list.length);
  for (const c of list) {
    for (const k of ["id", "name", "emoji", "color", "what"]) assert.ok(c[k], `${c.id ?? "?"} missing ${k}`);
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    assert.ok(c.facts.length >= 2, `${c.id} needs facts`);
    assert.equal(parseYouTubeId(c.video), c.video, `${c.id} needs a picture video id`);
    assert.ok(c.x >= 0 && c.x <= 100, `${c.id} needs picture focus x%`);
  }
});
