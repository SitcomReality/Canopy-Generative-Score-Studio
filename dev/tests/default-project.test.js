// Tests for the project schema and defensive hydration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT, EMPTY_STEPS, hydrateProject } from "../../src/music/default-project.js";

test("EMPTY_STEPS has 16 false steps", () => {
  assert.equal(EMPTY_STEPS.length, 16);
  assert.ok(EMPTY_STEPS.every((step) => step === false));
});

test("default melody has 16 entries of degree or null", () => {
  assert.equal(DEFAULT_PROJECT.melody.length, 16);
  for (const degree of DEFAULT_PROJECT.melody) {
    assert.ok(degree === null || (Number.isInteger(degree) && degree >= 0 && degree <= 7));
  }
});

test("hydrateProject fills missing fields from defaults", () => {
  const hydrated = hydrateProject({});
  assert.deepEqual(hydrated, DEFAULT_PROJECT);
});

test("hydrateProject keeps provided values", () => {
  const hydrated = hydrateProject({ name: "Custom", bpm: 120 });
  assert.equal(hydrated.name, "Custom");
  assert.equal(hydrated.bpm, 120);
  assert.equal(hydrated.key, DEFAULT_PROJECT.key);
});

test("hydrateProject truncates overlong arrays and pads short ones", () => {
  const long = hydrateProject({ melody: [1, 2, 3] });
  assert.equal(long.melody.length, 16);
  assert.deepEqual(long.melody.slice(0, 3), [1, 2, 3]);
  assert.ok(long.melody.slice(3).every((v) => v === null));

  const over = hydrateProject({ bass: Array(20).fill(true) });
  assert.equal(over.bass.length, 16);

  const perc = hydrateProject({ percussion: [true] });
  assert.equal(perc.percussion.length, 16);
  assert.equal(perc.percussion[0], true);
});

test("hydrateProject rejects non-array track data", () => {
  const bad = hydrateProject({ melody: "nope", bass: 42, percussion: null });
  assert.deepEqual(bad.melody, DEFAULT_PROJECT.melody);
  assert.deepEqual(bad.bass, DEFAULT_PROJECT.bass);
  assert.deepEqual(bad.percussion, DEFAULT_PROJECT.percussion);
});

test("hydrateProject merges partial mute state", () => {
  const hydrated = hydrateProject({ muted: { melody: true } });
  assert.equal(hydrated.muted.melody, true);
  assert.equal(hydrated.muted.bass, false);
});

test("JSON round-trip through hydrateProject is lossless", () => {
  const round = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  assert.deepEqual(hydrateProject(round), DEFAULT_PROJECT);
});
