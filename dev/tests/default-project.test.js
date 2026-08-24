// Tests for the project schema (version 2) and defensive hydration.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROJECT,
  DEFAULT_LAYERS,
  EMPTY_STEPS,
  LAYER_ROLES,
  PROJECT_VERSION,
  hydrateProject,
} from "../../src/music/default-project.js";

const LAYER_IDS = ["chords", "melody", "bass", "percussion"];

test("EMPTY_STEPS has 16 false steps", () => {
  assert.equal(EMPTY_STEPS.length, 16);
  assert.ok(EMPTY_STEPS.every((step) => step === false));
});

test("default project carries four layers with unique ids", () => {
  assert.equal(DEFAULT_PROJECT.version, PROJECT_VERSION);
  assert.deepEqual(DEFAULT_PROJECT.layers.map((layer) => layer.id), LAYER_IDS);
  const ids = new Set(DEFAULT_PROJECT.layers.map((layer) => layer.id));
  assert.equal(ids.size, DEFAULT_PROJECT.layers.length);
});

test("every default layer has 16 steps matching its role kind", () => {
  for (const layer of DEFAULT_LAYERS) {
    assert.equal(layer.steps.length, 16, layer.id);
    if (LAYER_ROLES[layer.role].kind === "degrees") {
      for (const degree of layer.steps) {
        assert.ok(degree === null || (Number.isInteger(degree) && degree >= 0 && degree <= 7));
      }
    } else {
      for (const step of layer.steps) assert.equal(typeof step, "boolean");
    }
  }
});

test("hydrateProject fills missing fields from defaults", () => {
  assert.deepEqual(hydrateProject({}), DEFAULT_PROJECT);
});

test("hydrateProject keeps provided values", () => {
  const hydrated = hydrateProject({ name: "Custom", bpm: 120, swing: 30 });
  assert.equal(hydrated.name, "Custom");
  assert.equal(hydrated.bpm, 120);
  assert.equal(hydrated.swing, 30);
  assert.deepEqual(hydrated.layers, DEFAULT_PROJECT.layers);
});

test("hydrateProject clamps bpm to 48..150 and percents to 0..100", () => {
  assert.equal(hydrateProject({ bpm: 300 }).bpm, 150);
  assert.equal(hydrateProject({ bpm: 10 }).bpm, 48);
  const layer = hydrateProject({ layers: [{ id: "melody", density: 400, variation: -5, humanize: 55 }] }).layers[0];
  assert.equal(layer.density, 100);
  assert.equal(layer.variation, 0);
  assert.equal(layer.humanize, 55);
});

test("hydrateProject sanitizes layer steps per role kind", () => {
  const project = hydrateProject({
    layers: [
      { id: "melody", role: "motif", steps: [1, 99, "x", 3] },
      { id: "perc", role: "percussion", steps: [1, 0, "yes", false] },
    ],
  });
  assert.deepEqual(project.layers[0].steps.slice(0, 4), [1, null, null, 3]);
  assert.equal(project.layers[0].steps.length, 16);
  assert.deepEqual(project.layers[1].steps.slice(0, 4), [true, false, true, false]);
  assert.equal(project.layers[1].steps.length, 16);
});

test("hydrateProject rejects unknown roles and dedupes ids", () => {
  const project = hydrateProject({
    layers: [
      { id: "a", role: "wizard", steps: [] },
      { id: "a", role: "bass", steps: [] },
    ],
  });
  assert.equal(project.layers[0].role, "motif");
  assert.equal(project.layers[1].role, "bass");
  assert.notEqual(project.layers[0].id, project.layers[1].id);
});

test("hydrateProject migrates version 1 flat projects", () => {
  const v1 = {
    version: 1,
    name: "Old draft",
    bpm: 90,
    key: "G",
    scale: "Dorian",
    progression: [0, 4, 5, 3],
    progressionName: "Homeward",
    melody: [2, null, 3, null, 2, null, 1, null, 0, null, 2, null, 4, null, 2, null],
    bass: Array(16).fill(true),
    percussion: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
    density: 71,
    variation: 22,
    humanize: 9,
    reverb: 50,
    swing: 15,
    instrument: "Warm reed",
    muted: { chords: false, melody: true, bass: false, percussion: true },
  };
  const migrated = hydrateProject(v1);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.reverb, 50);
  assert.equal(migrated.swing, 15);
  const byId = Object.fromEntries(migrated.layers.map((layer) => [layer.id, layer]));
  assert.deepEqual(byId.melody.steps, v1.melody);
  assert.deepEqual(byId.bass.steps, v1.bass);
  assert.deepEqual(byId.percussion.steps, v1.percussion);
  assert.equal(byId.melody.muted, true);
  assert.equal(byId.percussion.muted, true);
  assert.equal(byId.melody.instrument, "Warm reed");
  assert.equal(byId.melody.density, 71);
  assert.equal(byId.melody.variation, 22);
  assert.equal(byId.melody.humanize, 9);
  assert.equal(byId.chords.muted, false);
});

test("JSON round-trip through hydrateProject is lossless", () => {
  const round = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  assert.deepEqual(hydrateProject(round), DEFAULT_PROJECT);
});
