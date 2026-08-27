// Sequencer step-source integration test: drive the reworked createSequencer()
// (the engine's step adapter) with mock store/voices/engine — no Tone, no DOM.
// Verifies the migration kept the behavior: it computes events per step from
// the pure dynamics core, applies mute/solo as a gate at the emission boundary,
// runs bar-boundary arrangement, and publishes UI state to the store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";
import { createSequencer } from "../../src/audio/sequencer/index.js";
import { computeStepFrame } from "../../src/music/dynamics.js";

// A minimal voice bundle per layer that records what was triggered but never
// touches Tone. Enough of the shape dispatchEvents/arrangement consult.
function makeVoices(project) {
  const voices = {};
  for (const layer of project.layers) {
    const synth = { triggerAttackRelease: (...a) => triggered.push(["synth:" + layer.id, ...a]), volume: { rampTo: () => {} }, releaseAll: () => {} };
    const kick = { triggerAttackRelease: (...a) => triggered.push(["kick:" + layer.id, ...a]), volume: { rampTo: () => {} }, triggerRelease: () => {} };
    const hat = { triggerAttackRelease: (...a) => triggered.push(["hat:" + layer.id, ...a]), volume: { rampTo: () => {} }, triggerRelease: () => {} };
    const snare = { triggerAttackRelease: (...a) => triggered.push(["snare:" + layer.id, ...a]), triggerRelease: () => {} };
    voices[layer.id] = { kind: layer.role === "percussion" ? "drums" : layer.role === "harmony" ? "chords" : layer.role === "bass" ? "bass" : "melody", synth, kick, hat, snare };
  }
  return voices;
}

const triggered = [];
const onChange = [];

function fresh() {
  triggered.length = 0;
  onChange.length = 0;
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  const store = {
    get: () => ({ project, currentContext: "explore", queuedContext: null, flourishQueued: null }),
    set(patch) { Object.assign(project, patch); Object.keys(patch).forEach((k) => onChange.push(k)); },
    updateProject(patch) { Object.assign(project, patch); },
  };
  const voices = makeVoices(project);
  const gateState = { muted: new Set(), soloed: null };
  const engine = {
    stepSource: null,
    registerStep(src) { engine.stepSource = src; },
    isLayerAudible(id) {
      if (gateState.soloed !== null) return id === gateState.soloed;
      return !gateState.muted.has(id);
    },
  };
  const perfSteps = {};
  for (const layer of project.layers) {
    if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
  }
  const sequencer = createSequencer({ store, voices, perfSteps, engine });
  sequencer.attach();
  // Seed the drift RNG so every step's event draw is deterministic in tests
  // (the app seeds it from variationSeed on play; Math.random otherwise).
  sequencer.setDriftRng(seqRng(12345));
  return { sequencer, store, voices, engine, gateState, project };
}

// dispatchEvents calls triggerAttackRelease(note, duration, when, velocity), so
// the absolute start time is at index [3] of the recorded [kind, ...args].
const whenArg = (t) => t[3];

test("sequencer emits a step through the pure core; uses absolute times", () => {
  const h = fresh();
  assert.ok(h.engine.stepSource, "step source registered");
  h.engine.stepSource.onEvents({ step: 3, bar: 1, when: 100 });
  assert.ok(triggered.length > 0, "some events were dispatched");
  const whens = triggered.map(whenArg);
  assert.ok(whens.every((w) => typeof w === "number"), "absolute times used");
  assert.ok(whens.every((w) => w >= 100), "times are at/after the step's `when` (or when+offset)");
});

test("mute is gate-only: a muted layer's events are filtered at emission", () => {
  const h = fresh();
  h.gateState.muted.add("bass");
  h.engine.stepSource.onEvents({ step: 0, bar: 0, when: 100 });
  const bassTouch = triggered.some((t) => t[0] === "synth:bass" || t[0] === "kick:bass");
  assert.equal(bassTouch, false);
  // Other layers still fired.
  assert.ok(triggered.some((t) => t[0] === "synth:chords" || t[0] === "synth:melody"));
});

test("solo composes from the gate: only the soloed layer emits (non-boundary step)", () => {
  const h = fresh();
  h.gateState.muted.add("chords");
  // Melody has no activity gate, so it emits at the default intensity; step 3
  // is not a bar boundary (no arrangement resting).
  h.gateState.soloed = "melody";
  h.engine.stepSource.onEvents({ step: 3, bar: 1, when: 100 });
  const soloHit = triggered.filter((t) => t[0].includes("melody"));
  assert.ok(soloHit.length > 0, "soloed layer sounds");
  assert.ok(triggered.every((t) => t[0].includes("melody")), "only the soloed layer sounds");
});

test("sequencer publishes step/sounding to the store", () => {
  const h = fresh();
  h.engine.stepSource.onEvents({ step: 3, bar: 1, when: 100 });
  assert.ok(onChange.includes("step"), "published the step");
  assert.ok(onChange.includes("sounding"), "published sounding");
});

test("computeStepFrame is RNG-neutral to muted: mute never re-rolls other layers", () => {
  const base = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  const muted = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  muted.layers.find((l) => l.role === "bass").muted = true;
  const live = { intensity: 0.5, tension: 0.5, brightness: 0.5 };
  const a = computeStepFrame(base, live, {}, 0, seqRng(1));
  const b = computeStepFrame(muted, live, {}, 0, seqRng(1));
  assert.deepEqual(a, b, "a muted layer produces the same event/RNG sequence");
});

function seqRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}