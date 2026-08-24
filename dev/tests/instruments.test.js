// Instrument catalog invariants: every preset can voice every role, names
// are unique by construction (object keys), and default layers/hydration
// only ever reference presets that exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTRUMENTS, INSTRUMENT_NAMES, instrumentSettings } from "../../src/music/instruments.js";
import { DEFAULT_LAYERS, LAYER_ROLES, hydrateProject } from "../../src/music/default-project.js";

test("every instrument has a config for every layer role", () => {
  for (const name of INSTRUMENT_NAMES) {
    for (const role of Object.keys(LAYER_ROLES)) {
      assert.ok(INSTRUMENTS[name][role], `${name} is missing a ${role} config`);
    }
  }
});

test("every preset has oscillator/envelope or kick/hat shape data", () => {
  for (const name of INSTRUMENT_NAMES) {
    const preset = INSTRUMENTS[name];
    for (const role of ["motif", "harmony", "bass"]) {
      assert.ok(preset[role].oscillator && preset[role].envelope, `${name}/${role} lacks synth shape`);
    }
    assert.ok(preset.percussion.kick && preset.percussion.hat, `${name}/percussion lacks kick+hat`);
    if (name !== undefined) {
      assert.ok(preset.bass.filterEnvelope, `${name} bass should keep its filter envelope`);
    }
  }
});

test("instrumentSettings falls back to Glass bell for unknown names", () => {
  assert.deepEqual(instrumentSettings("Nonexistent", "motif"), instrumentSettings("Glass bell", "motif"));
});

test("default layers only use catalog instruments", () => {
  for (const layer of DEFAULT_LAYERS) {
    assert.ok(INSTRUMENT_NAMES.includes(layer.instrument), `${layer.id} uses unknown instrument`);
  }
});

test("hydrateProject rejects unknown instruments", () => {
  const project = hydrateProject({ layers: [{ ...DEFAULT_LAYERS[0], id: "x", instrument: "Theremin" }] });
  assert.equal(project.layers[0].instrument, DEFAULT_LAYERS[0].instrument);
});
