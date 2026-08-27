// Runtime-playback smoke test: build the EMITTED engine module with a mock
// Tone (functions can't survive JSON.stringify, so the mock is inlined as
// source), createScoreEngine(score), run setup() via startScore(), then step
// through one bar boundary. This is the only automated coverage of the
// runtime's real transport loop — it guards against both the atmosphere
// bindings path and the harmony-guard helpers that capture `score`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { scoreEngineSource } from "../../src/music/runtime-module.js";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";

// A Tone namespace that records every rampTo call so the test can assert what
// the transport actually drove. Gains/synths carry a `gain`/`volume`/`wet`.
const MOCK_TONE_SRC = `
globalThis.__calls = [];
const __ramp = (tag) => ({ value: 0, rampTo(v, t) { globalThis.__calls.push([tag, v, t]); }, setValueAtTime() {} });
class __Gain { constructor(b) { this.gain = __ramp("gain"); this.baseGain = b ?? 1; }
  connect() { return this; } toDestination() { return this; } disconnect() {} dispose() {} }
class __Node { connect() { return this; } toDestination() { return this; } start() { return this; } dispose() {} }
globalThis.__transport = {
  start() {}, stop() {}, clear() {}, position: 0, bpm: { value: 0, rampTo() {} },
  swing: 0, swingSubdivision: "8n", scheduleRepeat(cb) { globalThis.__cb = cb; return 1; },
};
const Tone = {
  start: async () => {},
  getTransport: () => globalThis.__transport,
  Gain: __Gain,
  Limiter: class extends __Node { constructor() { super(); } },
  Compressor: class extends __Node { constructor() { super(); } },
  Reverb: class extends __Node { constructor() { super(); this.wet = __ramp("reverb.wet"); } },
  FeedbackDelay: class extends __Node { constructor() { super(); this.wet = __ramp("delay.wet"); } },
  Filter: class extends __Node { constructor() { super(); } },
  Chorus: class extends __Node { constructor() { super(); } },
  Panner: class extends __Node { constructor() { super(); } },
  Synth: class extends __Node { constructor() { super(); this.volume = __ramp("synth.volume"); } triggerAttackRelease() {} },
  FMSynth: class {},
  PolySynth: class { constructor() { this._env = {}; }
    set(o) { const v = __ramp("synth.volume"); v.value = o.volume ?? 0; this.volume = v;
      this.envelope = o.envelope ?? {}; this.oscillator = o.oscillator ?? {}; return this; }
    connect() { return this; } disconnect() {} triggerAttackRelease() {}
  },
  PluckSynth: class { connect() { return this; } disconnect() {} triggerAttackRelease() {} },
  MonoSynth: class extends __Node { constructor() { super(); this.volume = __ramp("synth.volume"); } triggerAttackRelease() {} },
  MembraneSynth: class extends __Node { constructor() { super(); this.volume = __ramp("kick.volume"); } triggerAttackRelease() {} },
  NoiseSynth: class extends __Node { constructor() { super(); this.volume = __ramp("hat.volume"); } triggerAttackRelease() {} },
};
`;

async function buildRuntime(project) {
  const emitted = scoreEngineSource().replace(/^import \* as Tone from "tone";\n/, "");
  const file = path.join(os.tmpdir(), `canopy-rt-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(file, MOCK_TONE_SRC + emitted);
  const mod = await import(pathToFileURL(file).href);
  await mod.createScoreEngine(project).startScore();
  if (!globalThis.__cb) throw new Error("scheduleRepeat captured no callback");
  globalThis.__cb(0); // step 0 => bar boundary
  const calls = globalThis.__calls || [];
  return { calls, swing: globalThis.__transport.swing };
}

test("runtime plays a boundary without crashing and applies song-level atmosphere bindings", async () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  project.bindings = [
    { target: "reverb", axis: "tension", domain: [20, 90] },
    { target: "space.lead", axis: "intensity", domain: [0.1, 0.8] },
    { target: "space.bed", axis: "brightness", domain: [0.05, 0.7] },
    { target: "space.bass", axis: "intensity", domain: [0.02, 0.5] },
    { target: "space.echo", axis: "tension", domain: [0.05, 0.6] },
    { target: "swing", axis: "brightness", domain: [0, 120] },
  ];
  const { calls, swing } = await buildRuntime(project);
  const tags = calls.map((c) => c[0]);
  // Every bound atmosphere param is applied on the boundary. Live axes start
  // at { intensity:0.3, tension:0.25, brightness:0.7 } and the explore context
  // targets the same, so they stay put; easeToward(rate .5) is a no-op then.
  assert.ok(tags.includes("reverb.wet"), "reverb wet ramped from a binding");
  const sends = calls.filter((c) => c[0] === "gain").map((c) => c[1]);
  // lead=0.31, bed=0.505, bass=0.164, echo=0.1875 (linear domains on the live axes).
  assert.deepEqual(sends.map((v) => Math.round(v * 1000) / 1000), [0.31, 0.505, 0.164, 0.188]);
  assert.equal(swing, 0.84, "swing bound off brightness (0.7 -> 84 / 100)");
});

test("runtime leaves the atmosphere untouched when no binding targets it", async () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  project.bindings = []; // default
  const { calls } = await buildRuntime(project);
  const tags = calls.map((c) => c[0]);
  assert.ok(!tags.includes("reverb.wet"), "no reverb binding -> no reverb.rampTo");
  const sends = calls.filter((c) => c[0] === "gain");
  assert.equal(sends.length, 0, "no space binding -> no send rampTo");
});
