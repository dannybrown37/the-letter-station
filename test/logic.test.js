import { test } from "node:test";
import assert from "node:assert/strict";
import {
  firstLetter, wordsForLetter, playableLetters, makeLetterQuestion,
  makeStoreQuestion, makeYesNoQuestion, storesInState, parseYouTubeId, shuffle, checkLetterAnswer,
  isDeadThumb, mergeVideos, makeCharacterQuestion, makeMixedCharacterQuestion,
  bigNumberText, makeBigNumberQuestion, BIG_QUIZ_TYPES,
  ALPHABET, PAINTS, loadKeyboard, keyWord, makeKeyMission, KEY_MISSION_TYPES, missionDone, FINISHES, boardComplete, loadGallery, KEYBOARD, keyName,
} from "../js/logic.js";
import { BIG_NUMBERS, STATES, STORES, WORDS, KINDS, SING_VIDEOS, LBB_CHARACTERS, SING_CHARACTERS, LEARNING_STATION_CHARACTERS } from "../js/data.js";

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

for (const [label, list, min] of [["LBB_CHARACTERS", LBB_CHARACTERS, 6], ["SING_CHARACTERS", SING_CHARACTERS, 6], ["LEARNING_STATION_CHARACTERS", LEARNING_STATION_CHARACTERS, 3]]) test(`${label} profiles are complete and unique`, () => {
  assert.ok(list.length >= min);
  assert.equal(new Set(list.map((c) => c.id)).size, list.length);
  for (const c of list) {
    for (const k of ["id", "name", "emoji", "color", "what"]) assert.ok(c[k], `${c.id ?? "?"} missing ${k}`);
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    assert.ok(c.facts.length >= 2, `${c.id} needs facts`);
    assert.equal(parseYouTubeId(c.video), c.video, `${c.id} needs a picture video id`);
    assert.ok(c.x >= 0 && c.x <= 100, `${c.id} needs picture focus x%`);
  }
});

const CHARACTER_LISTS = [["SING_CHARACTERS", SING_CHARACTERS], ["LBB_CHARACTERS", LBB_CHARACTERS], ["LEARNING_STATION_CHARACTERS", LEARNING_STATION_CHARACTERS]];
const ALL_SHOWS = CHARACTER_LISTS.map(([, l]) => l);

for (const [label, list] of CHARACTER_LISTS) for (const seed of [1, 2, 3, 42, 99, 1234]) {
  test(`makeCharacterQuestion ${label} seed ${seed}: clue belongs to the answer, up to 4 different friends`, () => {
    const q = makeCharacterQuestion(list, seeded(seed));
    const n = Math.min(4, list.length);
    assert.equal(q.choices.length, n);
    assert.equal(new Set(q.choices.map((c) => c.id)).size, n);
    assert.ok(q.choices.includes(q.answer));
    assert.ok(q.answer.clues.includes(q.clue));
  });
}

for (const seed of [1, 2, 3, 42, 99, 1234, 5, 77, 31337, 8]) {
  test(`makeMixedCharacterQuestion seed ${seed}: another show in choices, no same-animal friend from another show`, () => {
    const q = makeMixedCharacterQuestion(ALL_SHOWS, seeded(seed));
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices).size, 4);
    assert.ok(q.choices.includes(q.answer));
    assert.ok(q.answer.clues.includes(q.clue));
    const answerList = ALL_SHOWS.find((l) => l.includes(q.answer));
    assert.ok(q.choices.some((c) => !answerList.includes(c)));
    for (const c of q.choices) if (!answerList.includes(c)) assert.notEqual(c.emoji, q.answer.emoji, `${c.id} looks like ${q.answer.id}`);
  });
}

test("makeMixedCharacterQuestion can ask about every show", () => {
  const rng = seeded(3);
  const asked = new Set();
  for (let i = 0; i < 200; i++) {
    const { answer } = makeMixedCharacterQuestion(ALL_SHOWS, rng);
    asked.add(ALL_SHOWS.find((l) => l.includes(answer)));
  }
  assert.equal(asked.size, ALL_SHOWS.length);
});

test("clues are unique across all shows (Mixed puts them together)", () => {
  const all = ALL_SHOWS.flat().flatMap((c) => c.clues);
  assert.equal(new Set(all).size, all.length);
});

test("makeMixedCharacterQuestion never pairs LBB Pig with a Sing pig", () => {
  const pig = LBB_CHARACTERS.find((c) => c.emoji === "🐷");
  const rng = seeded(7);
  for (let i = 0; i < 300; i++) {
    const q = makeMixedCharacterQuestion([SING_CHARACTERS, LBB_CHARACTERS], rng);
    if (q.answer === pig) assert.ok(!q.choices.some((c) => SING_CHARACTERS.includes(c) && c.emoji === "🐷"));
  }
});

const nameWords =(c) => c.name.split(" ").filter((w) => /^[A-Z][a-z]{2,}/.test(w));

for (const [label, list] of CHARACTER_LISTS) test(`${label} clues are unique and never give away the answer's name`, () => {
  const all = list.flatMap((c) => c.clues);
  assert.equal(new Set(all).size, all.length);
  for (const c of list) {
    assert.ok(c.clues.length >= 3, `${c.id} needs clues`);
    for (const clue of c.clues) for (const n of nameWords(c)) assert.ok(!clue.includes(n), `${c.id} clue "${clue}" says ${n}`);
  }
});

test("LEARNING_STATION_CHARACTERS has Don, Laurie and Jan", () => {
  assert.deepEqual(LEARNING_STATION_CHARACTERS.map((c) => c.name), ["Don", "Laurie", "Jan"]);
});

test("LBB_CHARACTERS has the friends he asked for", () => {
  const names = LBB_CHARACTERS.map((c) => c.name);
  for (const n of ["Jacus", "Pig", "Daisy", "William"]) assert.ok(names.includes(n), `missing ${n}`);
});

test("BIG_NUMBERS climb in order with unique names", () => {
  for (let i = 1; i < BIG_NUMBERS.length; i++) assert.ok(BIG_NUMBERS[i].zeros > BIG_NUMBERS[i - 1].zeros);
  assert.equal(new Set(BIG_NUMBERS.map((n) => n.name)).size, BIG_NUMBERS.length);
  assert.ok(BIG_NUMBERS.every((n) => n.fact && n.emoji));
});

test("BIG_NUMBERS go up one zero at a time, 0 to a googol", () => {
  assert.deepEqual(BIG_NUMBERS.map((n) => n.zeros), Array.from({ length: 101 }, (_, i) => i));
  assert.equal(BIG_NUMBERS.at(-1).name, "A Googol");
});

for (const [zeros, name] of [[0, "One"], [1, "Ten"], [2, "One Hundred"], [4, "Ten Thousand"], [7, "Ten Million"], [35, "One Hundred Decillion"], [36, "One Undecillion"], [98, "One Hundred Untrigintillion"], [99, "One Duotrigintillion"]]) {
  test(`BIG_NUMBERS[${zeros}] is ${name}`, () => assert.equal(BIG_NUMBERS[zeros].name, name));
}

test("BIG_NUMBERS keep their hand-written facts", () => {
  assert.match(BIG_NUMBERS[9].fact, /32 years/);
  assert.match(BIG_NUMBERS[15].fact, /ants/);
});

for (const [zeros, expected] of [[0, "1"], [1, "10"], [3, "1,000"], [4, "10,000"], [6, "1,000,000"], [9, "1,000,000,000"]]) {
  test(`bigNumberText(${zeros}) = ${expected}`, () => {
    assert.equal(bigNumberText(zeros), expected);
  });
}

test("bigNumberText(100) is a googol: 1 then 100 zeros", () => {
  const t = bigNumberText(100);
  assert.equal(t.replace(/,/g, ""), "1" + "0".repeat(100));
  assert.match(t, /^10,000(,000)+$/);
});

for (const type of BIG_QUIZ_TYPES) {
  test(`makeBigNumberQuestion ${type}: answer in unique choices`, () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const q = makeBigNumberQuestion(rng, type);
      assert.equal(q.type, type);
      assert.ok(q.choices.includes(q.answer));
      assert.equal(new Set(q.choices).size, q.choices.length);
      assert.equal(q.choices.length, type === "bigger" ? 2 : 4);
      if (type === "bigger") assert.ok(q.choices.every((c) => c.zeros <= q.answer.zeros));
      if (type === "number") assert.ok(q.choices.every((c) => c.zeros <= 15));
    }
  });
}

test("makeBigNumberQuestion picks a random type when none given", () => {
  const rng = seeded(3);
  const types = new Set(Array.from({ length: 100 }, () => makeBigNumberQuestion(rng).type));
  assert.deepEqual([...types].sort(), [...BIG_QUIZ_TYPES].sort());
});


test("PAINTS are hex colors with unique names", () => {
  assert.ok(PAINTS.every((p) => /^#[0-9a-f]{6}$/i.test(p.color)));
  assert.equal(new Set(PAINTS.map((p) => p.name)).size, PAINTS.length);
});

test("FINISHES have unique ids and labels", () => {
  assert.equal(new Set(FINISHES.map((f) => f.id)).size, FINISHES.length);
  assert.ok(FINISHES.every((f) => f.label && f.id));
  assert.equal(FINISHES[0].id, "solid");
});

for (const [raw, expected] of [
  [null, {}],
  ["junk", {}],
  [[1, 2], {}],
  [{ A: "#ff0000", b: "#00ff00", "1": "#000000", Space: "#111111", Nope: "#222222", C: "red", D: "#12345" },
    { A: { c: "#ff0000", f: "solid" }, "1": { c: "#000000", f: "solid" }, Space: { c: "#111111", f: "solid" } }],
  [{ Q: { c: "#ABCDEF", f: "dots" } }, { Q: { c: "#ABCDEF", f: "dots" } }],
  [{ Q: { c: "#ABCDEF", f: "lava" } }, { Q: { c: "#ABCDEF", f: "solid" } }],
  [{ Q: { c: "nope", f: "dots" }, R: { f: "dots" }, S: null }, {}],
]) {
  test(`loadKeyboard(${JSON.stringify(raw)}) keeps only A-Z keys with a hex color and known finish`, () => {
    assert.deepEqual(loadKeyboard(raw), expected);
  });
}

test("keyWord gives a word starting with the letter, or null", () => {
  const rng = seeded(5);
  for (const l of ALPHABET) {
    const w = keyWord(l, rng);
    if (w !== null) assert.equal(firstLetter(w), l);
  }
  assert.equal(firstLetter(keyWord("P", rng)), "P");
});

const finishIds = FINISHES.map((f) => f.id);
for (const type of KEY_MISSION_TYPES) {
  test(`makeKeyMission ${type}: valid letters and goal`, () => {
    const rng = seeded(11);
    for (let i = 0; i < 100; i++) {
      const m = makeKeyMission(rng, type);
      assert.equal(m.type, type);
      assert.ok(m.text);
      assert.ok(m.letters.length > 0);
      assert.equal(new Set(m.letters).size, m.letters.length);
      assert.ok(m.letters.every((l) => ALPHABET.includes(l)));
      if (type === "finish") {
        assert.equal(m.color, null);
        assert.ok(finishIds.includes(m.finish) && m.finish !== "solid");
      } else {
        assert.match(m.color, /^#[0-9a-f]{6}$/i);
        assert.ok(m.colorName);
        assert.equal(m.finish, null);
      }
      if (type === "vowels") assert.deepEqual(m.letters, ["A", "E", "I", "O", "U"]);
      if (type === "spell" || type === "finish") assert.ok(m.letters.length <= 7);
    }
  });
}

for (const [name, board, mission, expected] of [
  ["missing key", { A: { c: "#111111", f: "solid" } }, { letters: ["A", "B"], color: "#111111", finish: null }, false],
  ["wrong color", { A: { c: "#111111", f: "solid" }, B: { c: "#222222", f: "solid" } }, { letters: ["A", "B"], color: "#111111", finish: null }, false],
  ["color match, any finish", { A: { c: "#111111", f: "dots" }, B: { c: "#111111", f: "solid" } }, { letters: ["A", "B"], color: "#111111", finish: null }, true],
  ["finish match, any color", { A: { c: "#111111", f: "glitter" }, B: { c: "#999999", f: "glitter" } }, { letters: ["A", "B"], color: null, finish: "glitter" }, true],
  ["wrong finish", { A: { c: "#111111", f: "glitter" }, B: { c: "#999999", f: "dots" } }, { letters: ["A", "B"], color: null, finish: "glitter" }, false],
]) {
  test(`missionDone: ${name}`, () => {
    assert.equal(missionDone(board, mission), expected);
  });
}

test("every store color is a 6-digit hex (spell missions paint with it)", () => {
  for (const s of STORES) assert.match(s.color, /^#[0-9a-f]{6}$/i, s.name);
});

const fullBoard = (f = "solid") => Object.fromEntries(KEYBOARD.map((k) => [k.id, { c: "#112233", f }]));

test("KEYBOARD: unique ids, every letter, full-size extras", () => {
  const ids = KEYBOARD.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [...ALPHABET, "Esc", "F1", "F12", "1", "0", "Space", "Backspace", "Enter", "ShiftL", "ShiftR", "Up", "Num0", "Num7", "NumPlus", "NumEnter"]) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(KEYBOARD.length >= 100);
  assert.ok(KEYBOARD.every((k) => typeof k.label === "string" && k.w > 0 && k.h > 0));
});

test("KEYBOARD: no two keys overlap (quarter-unit cells)", () => {
  const taken = new Map();
  for (const k of KEYBOARD) {
    for (let x = k.x * 4; x < (k.x + k.w) * 4; x++) {
      for (let y = k.y; y < k.y + k.h; y++) {
        const cell = `${x},${y}`;
        assert.ok(!taken.has(cell), `${k.id} overlaps ${taken.get(cell)}`);
        taken.set(cell, k.id);
      }
    }
  }
});

for (const [id, expected] of [["A", "A"], ["7", "7"], ["Space", "space bar"], ["F5", "F 5"], ["Num7", "number pad 7"], ["Esc", "escape"], ["Up", "up arrow"]]) {
  test(`keyName(${id}) = ${expected}`, () => {
    assert.equal(keyName(id), expected);
  });
}

for (const [name, board, expected] of [
  ["empty", {}, false],
  ["letters only", Object.fromEntries(ALPHABET.map((l) => [l, { c: "#112233", f: "solid" }])), false],
  ["every key but Space", Object.fromEntries(KEYBOARD.filter((k) => k.id !== "Space").map((k) => [k.id, { c: "#112233", f: "solid" }])), false],
  ["every key", fullBoard(), true],
]) {
  test(`boardComplete: ${name}`, () => {
    assert.equal(boardComplete(board), expected);
  });
}

for (const [name, raw, expectedLen] of [
  ["null", null, 0],
  ["not an array", { a: 1 }, 0],
  ["drops incomplete and junk boards", [fullBoard(), { A: "#ffffff" }, "junk", null, fullBoard("dots")], 2],
  ["migrates old bare-hex boards", [Object.fromEntries(KEYBOARD.map((k) => [k.id, "#abcdef"]))], 1],
]) {
  test(`loadGallery: ${name}`, () => {
    const g = loadGallery(raw);
    assert.equal(g.length, expectedLen);
    assert.ok(g.every(boardComplete));
  });
}

test("loadGallery cleans each saved key", () => {
  const [b] = loadGallery([Object.fromEntries(KEYBOARD.map((k) => [k.id, "#abcdef"]))]);
  assert.deepEqual(b.A, { c: "#abcdef", f: "solid" });
});

for (const [name, raw, expected] of [
  ["keeps a jpeg snapshot", { A: { c: "#112233", f: "dots", img: "data:image/jpeg;base64,AAAA" } }, { A: { c: "#112233", f: "dots", img: "data:image/jpeg;base64,AAAA" } }],
  ["keeps a png snapshot", { A: { c: "#112233", f: "solid", img: "data:image/png;base64,QUJD+/=" } }, { A: { c: "#112233", f: "solid", img: "data:image/png;base64,QUJD+/=" } }],
  ["drops a non-image url", { A: { c: "#112233", f: "solid", img: "javascript:alert(1)" } }, { A: { c: "#112233", f: "solid" } }],
  ["drops an http url", { A: { c: "#112233", f: "solid", img: "https://example.com/x.png" } }, { A: { c: "#112233", f: "solid" } }],
  ["drops svg data (could carry script)", { A: { c: "#112233", f: "solid", img: "data:image/svg+xml;base64,AAAA" } }, { A: { c: "#112233", f: "solid" } }],
]) {
  test(`loadKeyboard snapshot: ${name}`, () => {
    assert.deepEqual(loadKeyboard(raw), expected);
  });
}

test("STATE_TILES places every state once, no two on the same tile", async () => {
  const { STATE_TILES } = await import("../js/data.js");
  assert.deepEqual(Object.keys(STATE_TILES).sort(), Object.keys(STATES).sort());
  const spots = Object.values(STATE_TILES).map(([c, r]) => `${c},${r}`);
  assert.equal(new Set(spots).size, spots.length);
  assert.ok(Object.values(STATE_TILES).every(([c, r]) => c >= 0 && c < 11 && r >= 0 && r < 8));
});

for (const [seed, letter] of [[1, undefined], [7, "B"], [42, "Q"]]) {
  test(`makeBalloonRound seed ${seed}: target appears, letters valid`, async () => {
    const { makeBalloonRound } = await import("../js/logic.js");
    const r = makeBalloonRound(seeded(seed), letter);
    if (letter) assert.equal(r.target, letter);
    assert.equal(r.balloons.length, 8);
    const hits = r.balloons.filter((b) => b === r.target).length;
    assert.ok(hits >= 2 && hits <= 3);
    assert.ok(r.balloons.every((b) => ALPHABET.includes(b)));
  });
}
