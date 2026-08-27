// Tests for the project schema (version 2) and defensive hydration.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROJECT,
  DEFAULT_LAYERS,
  EMPTY_STEPS,
  LAYER_ROLES,
  PROJECT_VERSION,
  convertStepsForRole,
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
  assert.equal(migrated.version, PROJECT_VERSION);
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

test("convertStepsForRole switches between step kinds without losing hits", () => {
  const degrees = [0, null, 4, null, 7, null, null, null, null, null, null, null, null, null, null, 0];
  const steps = convertStepsForRole(degrees, "motif", "harmony");
  assert.deepEqual(steps.slice(0, 5), [true, false, true, false, true]);
  const back = convertStepsForRole(steps, "harmony", "motif");
  assert.deepEqual(back.slice(0, 5), [0, null, 0, null, 0]);
  assert.deepEqual(convertStepsForRole(steps, "harmony", "bass"), steps);
});

test("JSON round-trip through hydrateProject is lossless", () => {
  const round = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  assert.deepEqual(hydrateProject(round), DEFAULT_PROJECT);
});

test("v4 reactive fields hydrate: axes, contexts, bindings, per-layer activity/fills/automation", () => {
  const v3 = {
    version: 3,
    name: "Legacy",
    bpm: 90,
    key: "G",
    scale: "Dorian",
    progression: [0, 4, 5, 3],
    reverb: 40,
    swing: 10,
    journey: { shape: "arc", length: 16, depth: 40 },
    variationSeed: 7,
    layers: [{ id: "perc", name: "Drums", role: "percussion", instrument: "Soft pluck", density: 60, variation: 10, humanize: 5, restWindow: 0, energyRole: "recessive", steps: [true, false, false, false, true, false, true, false, true, false, true, false, true, false, true, false] }],
  };
  const hydrated = hydrateProject(v3);
  // v3 -> v5: reactive fields get defaults, tempo bindings stay empty.
  assert.equal(hydrated.version, PROJECT_VERSION);
  assert.deepEqual(hydrated.axes, DEFAULT_PROJECT.axes);
  assert.deepEqual(hydrated.bindings, DEFAULT_PROJECT.bindings);
  assert.deepEqual(hydrated.contexts, DEFAULT_PROJECT.contexts);
  // Legacy v3 layer had no reactive fields -> defaults applied: activity/fills
  // stay null; automation defaults to the index-matched fallback layer's
  // automation (DEFAULT_LAYERS[0] = chords here), never undefined.
  assert.equal(hydrated.layers[0].activity, null);
  assert.equal(hydrated.layers[0].fills, null);
  assert.ok(Array.isArray(hydrated.layers[0].automation) && hydrated.layers[0].automation.length > 0);

  // A v4 score carrying explicit reactive fields is preserved (and the
  // percussion default activity survives). The legacy tempo.offset binding is
  // dropped on migration: bpm is static during playback from v5 on.
  const v4 = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  v4.bindings = [{ target: "tempo.offset", axis: "tension", domain: [0, 18] }];
  const again = hydrateProject(v4);
  assert.deepEqual(again.bindings, []);
  assert.equal(again.version, 6);
  const perc = again.layers.find((l) => l.id === "percussion");
  assert.deepEqual(perc.activity, { axis: "intensity", range: [0.35, 1] });
  assert.ok(Array.isArray(perc.automation) && perc.automation.length > 0);
  assert.deepEqual(perc.fills, [{ at: [8, 11, 14], axis: "intensity", threshold: 0.4 }, { at: [12], axis: "intensity", threshold: 0.6 }]);
});

test("v5 expressive fields hydrate: layer level, sections, flourishes", () => {
  const project = hydrateProject({
    layers: [{ id: "melody", level: -3 }],
    sections: [
      { id: "a", label: "Verse A", length: 4, layers: { melody: { gain: 2 }, percussion: { active: false } } },
      { id: "b", length: 99, layers: { bass: { gain: "loud" } } },
    ],
    flourishes: {
      victory: [{ degree: 9, octave: 2, at: 7, dur: -1, vel: 44 }],
      bogus: [{ degree: 0 }],
    },
  });
  assert.equal(project.version, 6);
  assert.equal(project.layers[0].level, -3);
  assert.equal(project.sections.length, 2);
  assert.equal(project.sections[1].length, 16); // clamped to 1..16
  assert.deepEqual(project.sections[0].layers.melody, { gain: 2 });
  assert.deepEqual(project.sections[0].layers.percussion, { active: false });
  assert.equal(project.sections[1].layers.bass, undefined); // non-numeric gain dropped
  // Out-of-range flourish values clamp into the harmony guard; unknown
  // flourish names are dropped.
  assert.deepEqual(project.flourishes.victory, [{ degree: 7, octave: 2, at: 3.75, dur: 0.05, vel: 1 }]);
  assert.ok(!("bogus" in project.flourishes));
});
