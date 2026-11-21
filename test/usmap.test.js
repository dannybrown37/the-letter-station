import { test } from "node:test";
import assert from "node:assert/strict";
import { US_VIEWBOX, US_PATHS, US_LABELS } from "../js/usmap.js";
import { STATES } from "../js/data.js";

const CODES = Object.keys(STATES).sort();
const [, , W, H] = US_VIEWBOX.split(" ").map(Number);

test("US_PATHS has exactly the 50 states", () => {
  assert.deepEqual(Object.keys(US_PATHS).sort(), CODES);
});

test("every state path is real path data", () => {
  for (const [code, d] of Object.entries(US_PATHS)) assert.match(d, /^[Mm] ?-?[\d.]/, code);
});

test("US_LABELS has a point inside the map for every state", () => {
  assert.deepEqual(Object.keys(US_LABELS).sort(), CODES);
  for (const [code, [x, y]] of Object.entries(US_LABELS)) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), code);
    assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `${code} at ${x},${y}`);
  }
});
