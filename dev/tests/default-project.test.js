// Tests for the project schema (version 8) and defensive hydration.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROJECT,
  DEFAULT_LAYERS,
  EMPTY_DEGREES,
  EMPTY_HITS,
  LAYER_ROLES,
  PROJECT_VERSION,
  convertStepsForRole,
  hydrateProject,
} from "../../src/music/default-project.js";

const LAYER_IDS = ["chords", "melody", "bass", "percussion"];

test("EMPTY_DEGREES is 16 nulls; EMPTY_HITS is 16 empty hit lists", () => {
  assert.equal(EMPTY_DEGREES.length, 16);
  assert.ok(EMPTY_DEGREES.every((degree) => degree === null));
  assert.equal(EMPTY_HITS.length, 16);
  assert.ok(EMPTY_HITS.every((hits) => Array.isArray(hits) && hits.length === 0));
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
      for (const hits of layer.steps) {
        assert.ok(Array.isArray(hits), layer.id);
        for (const hit of hits) {
          assert.equal(typeof hit.at, "number");
          assert.ok(hit.at >= 0 && hit.at <= 1, "at is an onset fraction");
          if (layer.role === "percussion") assert.equal(typeof hit.piece, "string");
        }
      }
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
      { id: "beat", role: "bass", steps: [[{ at: 0 }], [{ at: 0.5, vel: 0.9 }], "bad"] },
      {
        id: "drums",
        role: "percussion",
        steps: [
          [{ piece: "kick", at: 0 }],
          [{ piece: "womp", at: 0 }, { piece: "tom-hi", at: 0.5, pitch: 4, vel: 2 }],
          [{ piece: "hat", at: 0.25, vel: 0.4 }],
        ],
      },
    ],
  });
  // Degree steps: non-integers / out-of-range become null.
  assert.deepEqual(project.layers[0].steps.slice(0, 4), [1, null, null, 3]);
  assert.equal(project.layers[0].steps.length, 16);
  // Non-percussion hits keep at/vel; invalid entries become empty hit lists.
  assert.deepEqual(project.layers[1].steps.slice(0, 2), [[{ at: 0 }], [{ at: 0.5, vel: 0.9 }]]);
  assert.deepEqual(project.layers[1].steps[2], []);
  assert.equal(project.layers[1].steps.length, 16);
  // Percussion hits: unknown pieces dropped, vel clamped, pitch clamped to 0..7.
  assert.deepEqual(project.layers[2].steps[0], [{ at: 0, piece: "kick" }]);
  assert.deepEqual(project.layers[2].steps[1], [{ at: 0.5, piece: "tom-hi", vel: 1, pitch: 4 }]);
  assert.deepEqual(project.layers[2].steps[2], [{ at: 0.25, piece: "hat", vel: 0.4 }]);
  assert.equal(project.layers[2].steps.length, 16);
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

test("hydrateProject with no layers falls back to the default project (v1 is not migrated)", () => {
  // Schema v8 intentionally dropped backward compatibility for the old
  // boolean-step / flat-v1 format, so a flat source uses the default layers.
  const hydrated = hydrateProject({ name: "Legacy", bpm: 90, melody: [2, null, 3], bass: Array(16).fill(true) });
  assert.deepEqual(hydrated.layers, DEFAULT_PROJECT.layers);
});

test("convertStepsForRole switches between step kinds without losing hits", () => {
  const degrees = [0, null, 4, null, 7, null, null, null, null, null, null, null, null, null, null, 0];
  const hits = convertStepsForRole(degrees, "motif", "harmony");
  assert.deepEqual(hits.slice(0, 5), [[{ at: 0 }], [], [{ at: 0 }], [], [{ at: 0 }]]);
  const back = convertStepsForRole(hits, "harmony", "motif");
  assert.deepEqual(back.slice(0, 5), [0, null, 0, null, 0]);
});

test("convertStepsForRole keeps rhythm through a role change and fills percussion pieces", () => {
  const toPerc = convertStepsForRole([[{ at: 0 }], [], [{ at: 0.5 }]], "bass", "percussion");
  assert.deepEqual(toPerc[0], [{ at: 0, piece: "kick" }]);
  assert.deepEqual(toPerc[2], [{ at: 0.5, piece: "kick" }]);
  const toBass = convertStepsForRole([[{ piece: "kick", at: 0 }], []], "percussion", "bass");
  assert.deepEqual(toBass[0], [{ at: 0 }]);
});

test("JSON round-trip through hydrateProject is lossless", () => {
  const round = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  assert.deepEqual(hydrateProject(round), DEFAULT_PROJECT);
});

test("v4 reactive fields hydrate: axes, bindings, per-layer activity/fills/automation", () => {
  const v4 = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  v4.bindings = [{ target: "tempo.offset", axis: "tension", domain: [0, 18] }];
  const again = hydrateProject(v4);
  // The legacy tempo.offset binding is dropped on migration (bpm is static from v5 on).
  assert.deepEqual(again.bindings, []);
  assert.equal(again.version, 8);
  const perc = again.layers.find((l) => l.id === "percussion");
  assert.deepEqual(perc.activity, { axis: "intensity", range: [0.35, 1] });
  assert.ok(Array.isArray(perc.automation) && perc.automation.length > 0);
  assert.deepEqual(perc.fills, [{ at: [8, 11, 14], axis: "intensity", threshold: 0.4 }, { at: [12], axis: "intensity", threshold: 0.6 }]);
});

test("v5 expressive fields hydrate: layer level, sections; flourishes are dropped", () => {
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
  assert.equal(project.version, 8);
  assert.equal(project.layers[0].level, -3);
  assert.equal(project.sections.length, 2);
  assert.equal(project.sections[1].length, 16); // clamped to 1..16
  assert.deepEqual(project.sections[0].layers.melody, { gain: 2 });
  assert.deepEqual(project.sections[0].layers.percussion, { active: false });
  assert.equal(project.sections[1].layers.bass, undefined); // non-numeric gain dropped
  // v7 removes one-shot flourishes entirely — hydration silently drops them.
  assert.ok(!("flourishes" in project));
});
