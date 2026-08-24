// Phrase mutation tests: motif drift stays anchored, in-scale, and
// proportional to the variation rate. Runs against a deterministic rng.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mutateMotif, journeyEnergy } from "../../src/music/variation.js";

const MOTIF = [4, null, 6, 5, 4, 2, null, 1, 2, null, 4, 3, 2, 1, null, 0];

// Deterministic rng cycling through a fixed pattern.
function seqRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test("mutateMotif returns 16 steps holding degrees 0..7 or null", () => {
  const out = mutateMotif(MOTIF, 90, Math.random);
  assert.equal(out.length, 16);
  for (const step of out) {
    assert.ok(step === null || (Number.isInteger(step) && step >= 0 && step <= 7));
  }
});

test("rate 0 leaves the phrase untouched", () => {
  assert.deepEqual(mutateMotif(MOTIF, 0, () => 0.01), MOTIF);
});

test("phrase anchors survive: first and last steps never change", () => {
  for (let trial = 0; trial < 50; trial++) {
    const out = mutateMotif(MOTIF, 100, Math.random);
    assert.equal(out[0], MOTIF[0]);
    assert.equal(out[15], MOTIF[15]);
  }
});

test("high rate mutates interior steps", () => {
  const out = mutateMotif(MOTIF, 100, seqRng([0.1]));
  assert.notDeepEqual(out, MOTIF);
});

test("same rng sequence yields the same phrase (seed-ready)", () => {
  const a = mutateMotif(MOTIF, 60, seqRng([0.3, 0.8, 0.1, 0.6]));
  const b = mutateMotif(MOTIF, 60, seqRng([0.3, 0.8, 0.1, 0.6]));
  assert.deepEqual(a, b);
});

test("mutations stay close to home: shifts move at most one degree", () => {
  // rng always rolls the "shift degree" branch (< 0.4).
  const out = mutateMotif(MOTIF, 100, () => 0.1);
  MOTIF.forEach((step, index) => {
    if (step === null || index === 0 || index === 15) return;
    assert.ok(out[index] === null || Math.abs(out[index] - step) <= 1,
      `step ${index} drifted too far: ${step} -> ${out[index]}`);
  });
});

test("empty rests can spawn notes and notes can rest", () => {
  // Cycle: first draw crosses the mutation gate, second picks the branch.
  const gated = (() => {
    let i = 0;
    return () => [0.05, 0.95][i++ % 2];
  })();
  const allRests = Array(16).fill(null);
  allRests[0] = 0;
  allRests[15] = 0;
  const out = mutateMotif(allRests, 100, gated);
  assert.ok(out.some((step, index) => step !== null && index !== 0 && index !== 15));

  // Second draw in [0.4, 0.7) selects the "note becomes a rest" branch.
  let j = 0;
  const resting = () => [0.05, 0.55][j++ % 2];
  const dense = Array.from({ length: 16 }, (_, index) => (index === 0 || index === 15 ? 0 : 3));
  const rested = mutateMotif(dense, 100, resting);
  assert.ok(rested.some((step, index) => step === null && index !== 0 && index !== 15));
});

test("journeyEnergy stays within 0..1 and is periodic", () => {
  for (const shape of ["flat", "arc", "tide"]) {
    for (let bar = 0; bar < 64; bar++) {
      const energy = journeyEnergy(shape, 80, bar, 16);
      assert.ok(energy >= 0 && energy <= 1, `${shape} bar ${bar} out of range: ${energy}`);
    }
    assert.equal(journeyEnergy(shape, 80, 3, 16), journeyEnergy(shape, 80, 19, 16), `${shape} not periodic`);
  }
});

test("flat shape ignores depth; depth 0 is always neutral", () => {
  for (let bar = 0; bar < 32; bar++) assert.equal(journeyEnergy("flat", 90, bar, 8), 0.5);
  for (const shape of ["arc", "tide"]) {
    for (let bar = 0; bar < 32; bar++) assert.equal(journeyEnergy(shape, 0, bar, 8), 0.5);
  }
});

test("arc builds to a peak mid-cycle at full depth", () => {
  assert.equal(journeyEnergy("arc", 100, 0, 16), 0);
  assert.equal(journeyEnergy("arc", 100, 8, 16), 1);
});
