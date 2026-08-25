// Instrument catalog invariants: every preset can voice every role, names
// are unique by construction (object keys), and default layers/hydration
// only ever reference presets that exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTRUMENTS, INSTRUMENT_NAMES, instrumentSettings } from "../../src/music/instruments.js";
import { resolveInstrumentConfig, sanitizeInstrumentConfig } from "../../src/music/instrument-override.js";
import { DEFAULT_LAYERS, LAYER_ROLES, hydrateProject } from "../../src/music/default-project.js";

test("every instrument has a config for every layer role", () => {
  for (const name of INSTRUMENT_NAMES) {
    for (const role of Object.keys(LAYER_ROLES)) {
      assert.ok(INSTRUMENTS[name][role], `${name} is missing a ${role} config`);
    }
  }
});

test("every preset has oscillator/envelope or pluck shape data", () => {
  for (const name of INSTRUMENT_NAMES) {
    const preset = INSTRUMENTS[name];
    for (const role of ["motif", "harmony", "bass"]) {
      const shapeOk = (preset[role].oscillator && preset[role].envelope) || preset[role].pluck;
      assert.ok(shapeOk, `${name}/${role} lacks synth shape`);
    }
    // Pluck voices are Karplus-strong: no filter envelope applies.
    if (!preset.bass.pluck) {
      assert.ok(preset.bass.filterEnvelope, `${name} bass should keep its filter envelope`);
    }
    assert.ok(preset.percussion.kick && preset.percussion.hat, `${name}/percussion lacks kick+hat`);
    if (preset.percussion.snare) {
      assert.ok(preset.percussion.snare.noise && preset.percussion.snare.envelope, `${name}/percussion snare lacks shape`);
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

test("sanitizeInstrumentConfig whitelists shape and clamps envelope", () => {
  assert.equal(sanitizeInstrumentConfig(null), null);
  assert.equal(sanitizeInstrumentConfig({}), null);
  // Unknown keys are dropped — hydration must never smuggle synth options.
  assert.deepEqual(sanitizeInstrumentConfig({ volume: -30, harmonicity: 9, oscillator: "square" }), {
    oscillator: "square",
  });
  const cfg = sanitizeInstrumentConfig({
    oscillator: "sawtooth",
    envelope: { attack: 99, decay: -3, sustain: 0.42, release: 1.5 },
  });
  assert.equal(cfg.oscillator, "sawtooth");
  assert.equal(cfg.envelope.attack, 4);
  assert.equal(cfg.envelope.decay, 0.01);
  assert.equal(cfg.envelope.sustain, 0.42);
});

test("resolveInstrumentConfig merges the override over the preset", () => {
  const layer = {
    instrument: "Glass bell",
    instrumentConfig: { oscillator: "sawtooth", envelope: { attack: 0.2 } },
  };
  const merged = resolveInstrumentConfig(layer, "motif");
  const preset = instrumentSettings("Glass bell", "motif");
  assert.equal(merged.oscillator.type, "sawtooth"); // override wins
  assert.equal(merged.envelope.attack, 0.2); // override wins
  assert.equal(merged.envelope.decay, preset.envelope.decay); // preset falls through
  assert.equal(merged.envelope.release, preset.envelope.release);
  // No override -> byte-identical to the preset.
  assert.deepEqual(resolveInstrumentConfig({ instrument: "Glass bell" }, "motif"), preset);
});

test("hydrateProject round-trips a valid instrumentConfig and drops bad ones", () => {
  const good = { oscillator: "triangle", envelope: { attack: 0.3, release: 2 } };
  const project = hydrateProject({
    layers: [
      { ...DEFAULT_LAYERS[0], id: "x", instrumentConfig: good },
      { ...DEFAULT_LAYERS[1], id: "y", instrumentConfig: { oscillator: "laser", envelope: { nope: 1 } } },
      { ...DEFAULT_LAYERS[2], id: "z" },
    ],
  });
  assert.deepEqual(project.layers[0].instrumentConfig, good);
  assert.equal(project.layers[1].instrumentConfig, null);
  assert.equal(project.layers[2].instrumentConfig, null);
});
