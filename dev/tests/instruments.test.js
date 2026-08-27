// Instrument catalog invariants: every preset can voice every role, names
// are unique by construction (object keys), and default layers/hydration
// only ever reference presets that exist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTRUMENTS, INSTRUMENT_NAMES, instrumentSettings } from "../../src/music/instruments.js";
import { resolveInstrumentConfig, sanitizeInstrumentConfig } from "../../src/music/instrument-override.js";
import { DEFAULT_LAYERS, LAYER_ROLES, hydrateProject, DEFAULT_PROJECT } from "../../src/music/default-project.js";
import { runtimeModule, scoreEngineSource } from "../../src/music/runtime-module.js";

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

test("emitted runtime embeds per-layer overrides and their resolver", () => {
  const layer = { ...DEFAULT_LAYERS[0], instrumentConfig: { oscillator: "sawtooth", envelope: { attack: 0.3 } } };
  const project = { ...DEFAULT_PROJECT, layers: [layer, ...DEFAULT_PROJECT.layers.slice(1)] };
  const data = runtimeModule(project);
  const engine = scoreEngineSource();
  // The override travels inside the embedded score data...
  assert.ok(data.includes('"instrumentConfig"'), "score JSON carries the override");
  assert.ok(data.includes('"attack": 0.3'), "override values are embedded");
  // ...and the shared engine ships the same resolution logic.
  assert.ok(engine.includes("function sanitizeInstrumentConfig"), "resolver is shipped");
  assert.ok(engine.includes("resolveInstrumentConfig(layer, \"harmony\")"), "setup consumes resolved configs");
});

test("hydrateProject preserves a layer's custom-instrument id", () => {
  const instruments = {
    "my-bell": {
      label: "My Bell",
      voice: { voice: "fm", oscillator: { type: "sine" }, envelope: { attack: 0.1 } },
      percussion: { kick: { pitchDecay: 0.03 }, hat: { noise: { type: "white" } } },
    },
  };
  const project = hydrateProject({
    instruments,
    layers: [
      { id: "melody", role: "motif", instrument: "my-bell", steps: [4, null, 6] },
      { id: "perc", role: "percussion", instrument: "my-bell", steps: [[{ piece: "kick", at: 0 }]] },
      { id: "chords", role: "harmony", instrument: "Warm reed", steps: [[{ at: 0 }]] },
    ],
  });
  // A custom id that exists in the song's instruments is kept on the layer...
  assert.equal(project.layers.find((l) => l.id === "melody").instrument, "my-bell");
  // ...for pitched layers (the resolver finds the custom voice) ...
  assert.equal(resolveInstrumentConfig(project.layers.find((l) => l.id === "melody"), "motif", project).voice, "fm");
  // ...and for percussion layers (makeDrums finds the custom kit).
  assert.equal(project.layers.find((l) => l.id === "perc").instrument, "my-bell");
  // A catalog preset name is preserved as-is; an unknown id still falls back.
  assert.equal(project.layers.find((l) => l.id === "chords").instrument, "Warm reed");
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

test("v6 custom instruments hydrate and resolve into a layer's voice", () => {
  const instruments = {
    "my-bell": {
      label: "My Bell",
      voice: { voice: "fm", oscillator: { type: "sine" }, envelope: { attack: 0.1, decay: 0.4, sustain: 0.2, release: 1.5 } },
      percussion: { kick: { pitchDecay: 0.03, octaves: 6, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 } }, hat: { noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 } } },
    },
  };
  const project = hydrateProject({ instruments });
  assert.equal(project.instruments["my-bell"].label, "My Bell");
  assert.equal(project.instruments["my-bell"].voice.voice, "fm");
  assert.ok(project.instruments["my-bell"].percussion.kick);
  // A layer referencing the custom instrument resolves to its voice, with the
  // per-layer override still merged on top.
  const layer = { instrument: "my-bell", instrumentConfig: { oscillator: "sawtooth" } };
  const resolved = resolveInstrumentConfig(layer, "motif", project);
  assert.equal(resolved.oscillator.type, "sawtooth");
  assert.deepEqual(resolved.envelope, { attack: 0.1, decay: 0.4, sustain: 0.2, release: 1.5 });
});

test("v6 untrusted custom-instrument configs are sanitized away", () => {
  const project = hydrateProject({ instruments: { bad: { label: "Bad", voice: { oscillator: { type: "laser" }, volume: -30 } } } });
  // An instrument with no usable voice and no kit is dropped entirely.
  assert.equal(project.instruments.bad, undefined);
});

test("emitted runtime resolves custom instruments and kits", () => {
  const project = hydrateProject({
    instruments: { "my-bell": { label: "My Bell", voice: { voice: "fm", oscillator: { type: "sine" }, envelope: { attack: 0.1 } }, percussion: { kick: { pitchDecay: 0.03, octaves: 6 }, hat: { noise: { type: "white" } } } } },
  });
  const data = runtimeModule(project);
  const engine = scoreEngineSource();
  assert.ok(data.includes('"my-bell"'), "score data carries the custom instrument");
  assert.ok(engine.includes("score.instruments?.[layer.instrument]"), "resolve consults custom voice");
  assert.ok(engine.includes("activeScore?.instruments?.[instrument]?.percussion"), "makeDrums consults custom kit");
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
