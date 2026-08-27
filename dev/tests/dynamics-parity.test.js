// Anti-drift gate: the reactive-dynamics decision core is the single source of
// truth (src/music/dynamics.js). When we export a .score.js runtime, that core
// is spliced verbatim into the emitted file so the game hears exactly what the
// studio preview does. This test proves the emitted copy stays byte-identical
// to the source (modulo export/import keywords), so the two can't silently
// diverge. It also sanity-checks the emitted module's public API shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runtimeModule, scoreEngineSource } from "../../src/music/runtime-module.js";
import { DYNAMICS_SOURCE } from "../../src/music/dynamics.vendored.js";
import { dynamicsVendorSource } from "../../dev/scripts/vendor_dynamics.mjs";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";

test("vendored dynamics core matches dynamics.js (anti-drift)", () => {
  const fresh = dynamicsVendorSource();
  const norm = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
  assert.equal(norm(DYNAMICS_SOURCE), norm(fresh), "dynamics.vendored.js is stale; run python3 dev/scripts/build.py");
});

test("emitted runtime splices the dynamics core verbatim (parity)", () => {
  const emitted = scoreEngineSource();
  const begin = emitted.indexOf("__RT_DYN_BEGIN__");
  const end = emitted.indexOf("__RT_DYN_END__");
  assert.ok(begin >= 0 && end > begin, "markers present");
  const spliced = emitted.slice(begin + "__RT_DYN_BEGIN__".length, end);
  const norm = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
  assert.equal(norm(spliced), norm(DYNAMICS_SOURCE), "spliced core matches vendored dynamics");
});

test("data-only score module exports the song with no engine", () => {
  const emitted = runtimeModule(DEFAULT_PROJECT);
  assert.match(emitted, /export const score = /, "data module exports score");
  assert.doesNotMatch(emitted, /import \* as Tone|createScoreEngine/, "data module has no Tone import or engine");
});

test("runtime public API surface is stable", async () => {
  const emitted = scoreEngineSource();
  // Emit to a temp file and import it (stubbing `tone`).
  const file = path.join(os.tmpdir(), `canopy-parity-${Date.now()}.mjs`);
  const body = emitted.replace(/^import \* as Tone from "tone";\n/, "");
  const withTone = `const Tone = ${JSON.stringify(mockTone)};\n${body}`;
  writeFileSync(file, withTone);
  const mod = await import(pathToFileURL(file).href);
  assert.equal(typeof mod.createScoreEngine, "function", "exports createScoreEngine");
  const rt = mod.createScoreEngine(DEFAULT_PROJECT);
  const pub = ["startScore", "stopScore", "setGameMusicState", "musicEvent", "disposeScore", "getRuntimeInfo", "setGameAxes"];
  for (const name of pub) {
    assert.equal(typeof rt[name], "function", `runtime exposes ${name}`);
  }
});

const mockTone = {
  getTransport: () => ({
    start: () => {}, stop: () => {}, clear: () => {}, position: 0,
    bpm: { value: 0, rampTo: () => {} }, swing: 0, swingSubdivision: "8n",
    scheduleRepeat: () => 1,
  }),
  Reverb: class { constructor() { this.wet = { value: 0, rampTo: () => {} }; } toDestination() { return this; } connect() { return this; } },
  PolySynth: class { set() { return this; } },
  Synth: class {},
  MonoSynth: class {},
  MembraneSynth: class { connect() { return this; } toDestination() { return this; } },
  NoiseSynth: class { connect() { return this; } toDestination() { return this; } },
};