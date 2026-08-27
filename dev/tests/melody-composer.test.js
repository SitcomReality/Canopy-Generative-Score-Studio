// Tests for the generative motif helpers. composeMelody is random, so we
// assert structural invariants over many runs rather than exact output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeMelody, composePattern, makeSparser } from "../../src/music/melody-composer.js";
import { SCALES } from "../../src/music/scales.js";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";

test("composeMelody returns 16 steps with in-scale degrees or null", () => {
  for (const scale of Object.keys(SCALES)) {
    const project = { ...DEFAULT_PROJECT, scale };
    const layer = DEFAULT_PROJECT.layers.find((item) => item.id === "melody");
    for (let run = 0; run < 20; run += 1) {
      const melody = composeMelody(project, layer);
      assert.equal(melody.length, 16);
      const max = 7; // composer clamps the cursor to 0..7
      for (const degree of melody) {
        assert.ok(degree === null || (Number.isInteger(degree) && degree >= 0 && degree <= max));
      }
    }
  }
});

test("composeMelody anchors phrase starts on chord degrees", () => {
  for (let run = 0; run < 20; run += 1) {
    const melody = composeMelody(DEFAULT_PROJECT, DEFAULT_PROJECT.layers.find((l) => l.id === "melody"));
    for (let bar = 0; bar < 4; bar += 1) {
      const chord = DEFAULT_PROJECT.progression[bar];
      const anchor = melody[bar * 4];
      const expected = [chord + 2, chord + 4].map((d) => Math.min(7, d));
      assert.ok(
        expected.includes(anchor),
        `bar ${bar} anchor ${anchor} vs chord ${chord}`,
      );
    }
  }
});

test("composeMelody always resolves the final step to the tonic", () => {
  for (let run = 0; run < 20; run += 1) {
    assert.equal(composeMelody(DEFAULT_PROJECT, DEFAULT_PROJECT.layers.find((l) => l.id === "melody"))[15], 0);
  }
});

test("composePattern returns 16 hit lists shaped by role and density", () => {
  const base = { density: 100 };
  for (const role of ["harmony", "bass", "percussion"]) {
    for (let run = 0; run < 20; run += 1) {
      const pattern = composePattern({ ...base, role });
      assert.equal(pattern.length, 16);
      for (const hits of pattern) {
        assert.ok(Array.isArray(hits, "each step is a hit list"));
        for (const hit of hits) {
          assert.equal(typeof hit.at, "number");
          if (role === "percussion") assert.equal(typeof hit.piece, "string");
        }
      }
      if (role !== "percussion") {
        assert.ok(pattern[0].length && pattern[4].length && pattern[8].length && pattern[12].length, `${role} anchors bar starts`);
      }
    }
  }
});

test("makeSparser only removes non-anchor steps", () => {
  for (let run = 0; run < 20; run += 1) {
    const melody = composeMelody(DEFAULT_PROJECT, DEFAULT_PROJECT.layers.find((l) => l.id === "melody"));
    const sparser = makeSparser(melody);
    assert.equal(sparser.length, 16);
    for (let index = 0; index < 16; index += 1) {
      if (index % 4 === 0) {
        assert.equal(sparser[index], melody[index]);
      } else {
        assert.ok(sparser[index] === melody[index] || sparser[index] === null);
      }
    }
  }
});
