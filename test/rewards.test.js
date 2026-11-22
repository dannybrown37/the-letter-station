import { test } from "node:test";
import assert from "node:assert/strict";
import { starTrail, rewardLine, starMilestone, TRAIL_SIZE, shade } from "../js/logic.js";

// null lets tint() fall back to the home pink instead of writing a broken color.
for (const [hex, t, expected] of [
  ["#ff8a3d", 0.78, "#c76c30"],
  ["#FFFFFF", 0.5, "#808080"],
  ["#000000", 0.78, "#000000"],
  ["#2fb36a", 1, "#2fb36a"],
  ["#e80", 0.5, null],
  ["orange", 0.5, null],
  [undefined, 0.5, null],
]) {
  test(`shade(${hex}, ${t}) = ${expected}`, () => assert.equal(shade(hex, t), expected));
}

test("trail holds 5 stars", () => assert.equal(TRAIL_SIZE, 5));

for (const [count, filled, party] of [
  [0, 0, false],
  [1, 1, false],
  [4, 4, false],
  [5, 5, true],
  [6, 1, false],
  [10, 5, true],
  [12, 2, false],
]) {
  test(`starTrail(${count}) = ${filled} filled${party ? ", party" : ""}`, () => {
    assert.deepEqual(starTrail(count), { filled, party });
  });
}

for (const [stars, expected] of [[0, false], [9, false], [10, true], [20, true], [25, false]]) {
  test(`starMilestone(${stars}) = ${expected}`, () => assert.equal(starMilestone(stars), expected));
}

// Regression: the 10-star line used to be said first, then cut off by the cheer.
for (const [args, expected] of [
  [{ cheer: "Great job!", extra: "", stars: 3 }, "Great job!"],
  [{ cheer: "Great job!", extra: "Utah has R&R.", stars: 3 }, "Great job! Utah has R&R."],
  [{ cheer: "Awesome!", extra: "It's Mia!", stars: 10 }, "Awesome! It's Mia! Wow! 10 stars!"],
  [{ cheer: "Awesome!", extra: "It's Mia!", stars: 7, party: true }, "Awesome! It's Mia! Your star trail is full!"],
  [{ cheer: "Yes!", extra: "", stars: 20, party: true }, "Yes! Your star trail is full! Wow! 20 stars!"],
  [{ cheer: "Yes!", extra: "  ", stars: 0 }, "Yes!"],
]) {
  test(`rewardLine → ${expected}`, () => {
    assert.equal(rewardLine(args), expected);
  });
}
