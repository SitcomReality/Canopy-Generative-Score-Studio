// Deterministic performance humanization: timing offsets scale audibly with
// the layer's humanize %, per-note velocity jitters within bounded width,
// and everything stays reproducible under a seeded rng.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStepFrame } from "../../src/music/dynamics.js";
import { humanDelay, humanVelocity } from "../../src/music/dynamics/humanize.js";
import { makeRng } from "../../src/music/variation.js";

const LIVE = { intensity: 0.5, tension: 0.5, brightness: 0.5 };

function motifProject(humanize) {
  return {
    bpm: 100,
    key: "C",
    scale: "major",
    progression: [0],
    layers: [
      {
        id: "m",
        role: "motif",
        instrument: "Hollow mallet",
        steps: [0, null, 4, null, 2, null, 7, null, 0, null, 4, null, 2, null, 7, null],
        density: 100,
        variation: 0,
        humanize,
        automation: [{ param: "velocity", axis: "intensity", domain: [0.4, 0.4] }],
      },
    ],
  };
}

function collect(project, seed) {
  const rng = makeRng(seed);
  const out = [];
  for (let step = 0; step < 16; step++) {
    out.push(...computeStepFrame(project, LIVE, { features: {}, resting: [] }, step, rng));
  }
  return out;
}

test("humanDelay scales up to ~90ms at full humanize", () => {
  const tight = { humanize: 0 };
  const loose = { humanize: 100 };
  assert.equal(humanDelay(tight, Math.random), 0);
  for (let i = 0; i < 50; i++) {
    const d = humanDelay(loose, Math.random);
    assert.ok(d >= 0 && d <= 0.09, `offset ${d} within [0, 0.09]`);
  }
});

test("humanVelocity stays in range and is exact when humanize is 0", () => {
  const tight = { humanize: 0 };
  assert.equal(humanVelocity(tight, 0.4, Math.random), 0.4);
  const loose = { humanize: 100 };
  for (let i = 0; i < 100; i++) {
    const v = humanVelocity(loose, 0.4, Math.random);
    assert.ok(v >= 0.05 && v <= 1, `velocity ${v} in [0.05, 1]`);
  }
});

test("computeStepFrame is deterministic under a seeded rng", () => {
  const project = motifProject(30);
  assert.deepEqual(collect(project, 7), collect(project, 7));
});

test("loose humanize varies note-to-note velocity; tight does not", () => {
  const looseVelocities = collect(motifProject(60), 11)
    .filter((ev) => ev.kind === "scale")
    .map((ev) => ev.velocity);
  assert.ok(looseVelocities.length >= 8, "motif sounds on most steps");
  assert.ok(new Set(looseVelocities).size > 1, "velocities vary note-to-note");

  const tightVelocities = collect(motifProject(0), 11)
    .filter((ev) => ev.kind === "scale")
    .map((ev) => ev.velocity);
  assert.ok(new Set(tightVelocities).size === 1, "zero humanize keeps machine-uniform velocity");
});
