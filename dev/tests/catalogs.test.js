// Tests for the static catalogs: keys, scales, progressions, contexts, tracks.
// These back the UI dropdowns and the harmony guard, so their invariants matter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KEYS } from "../../src/music/keys.js";
import { SCALES } from "../../src/music/scales.js";
import { PROGRESSIONS, ROMAN_NUMERALS } from "../../src/music/progressions.js";
import { CONTEXTS } from "../../src/music/contexts.js";
import { TRACKS } from "../../src/music/tracks.js";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";

test("scales start at the root and ascend", () => {
  for (const [name, intervals] of Object.entries(SCALES)) {
    assert.equal(intervals[0], 0, name);
    for (let i = 1; i < intervals.length; i += 1) {
      assert.ok(intervals[i] > intervals[i - 1], name);
      assert.ok(intervals[i] < 12, name);
    }
  }
});

test("scale names referenced by the default project exist", () => {
  assert.ok(SCALES.Lydian);
});

test("every progression has 4 in-scale degrees and a unique name", () => {
  const names = new Set();
  for (const { name, degrees } of PROGRESSIONS) {
    assert.equal(degrees.length, 4, name);
    for (const degree of degrees) {
      assert.ok(Number.isInteger(degree) && degree >= 0 && degree <= 6, name);
    }
    assert.ok(!names.has(name), `duplicate progression ${name}`);
    names.add(name);
  }
});

test("roman numerals cover 7 degrees", () => {
  assert.equal(ROMAN_NUMERALS.length, 7);
});

test("contexts have unique ids, names, icons, and axis targets", () => {
  const ids = new Set();
  for (const context of CONTEXTS) {
    assert.ok(!ids.has(context.id), `duplicate context ${context.id}`);
    ids.add(context.id);
    assert.ok(context.name && context.short && context.icon);
    // v4: contexts carry a targets axis vector over the canonical axes.
    for (const axis of ["intensity", "tension", "brightness"]) {
      assert.ok(Number.isFinite(context.targets?.[axis]), `${context.id} missing ${axis} target`);
      assert.ok(context.targets[axis] >= 0 && context.targets[axis] <= 1, `${context.id} ${axis} out of range`);
    }
  }
  assert.deepEqual([...ids].sort(), ["combat", "explore", "unease"]);
});

test("tracks have unique ids and colors", () => {
  const ids = new Set();
  const colors = new Set();
  for (const track of TRACKS) {
    assert.ok(!ids.has(track.id), `duplicate track ${track.id}`);
    ids.add(track.id);
    assert.match(track.color, /^#[0-9a-f]{6}$/i);
    assert.ok(!colors.has(track.color), `duplicate color ${track.color}`);
    colors.add(track.color);
    assert.ok(track.name && track.detail);
  }
  assert.equal(TRACKS.length, 4);
});

test("default project has one layer per track id", () => {
  for (const track of TRACKS) {
    assert.ok(DEFAULT_PROJECT.layers.some((layer) => layer.id === track.id));
  }
});
