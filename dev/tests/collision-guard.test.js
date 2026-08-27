// Collision-guard test: Tone requires each physical voice's start times to
// strictly increase in call order, or it throws "Start time must be strictly
// greater than previous start time" / "The time must be greater than or equal
// to the last scheduled time". orderEvents sorts within a step but cannot fix
// equal offsets on one voice or cross-step overlap. dispatchEvents' resolveEventTime
// enforces strict increase per voice group, bumping any colliding event by an
// inaudible epsilon. These tests pin that guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEventTime, dispatchEvents } from "../../src/audio/sequencer/event-dispatch.js";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";

const EPSILON = 0.001;

test("resolveEventTime avoids equal offsets on the same voice (within a step)", () => {
  const last = {};
  const base = 10;
  // Two hats at the same offset on the same layer (perc voice).
  const a = resolveEventTime("perc", "hat", 0.02, base, last);
  const b = resolveEventTime("perc", "hat", 0.02, base, last);
  assert.ok(b > a, `hat must be strictly after the previous: ${a} -> ${b}`);
  assert.ok(Math.abs(b - a - EPSILON) < 1e-9, "bumped by exactly epsilon");
});

test("snare falling back to the hat shares the perc voice and is ordered", () => {
  const last = {};
  const base = 10;
  const hat = resolveEventTime("perc", "hat", 0.01, base, last);
  const snare = resolveEventTime("perc", "snare", 0.01, base, last); // same group, same offset
  assert.ok(snare > hat, "snare (on a snareless kit) must be after the hat");
});

test("cross-step overlap: a later step's event clamps after a prior far-offset event", () => {
  const last = {};
  // Step 6 emits a snare at offset 0.26 (base 6.0) -> 6.26.
  const base6 = 6.0;
  const snare6 = resolveEventTime("perc", "snare", 0.26, base6, last);
  // Step 7 emits a hat at offset 0 (base 6.3, at 100bpm) -> 6.3 < 6.26 collides.
  const base7 = 6.3;
  const hat7 = resolveEventTime("perc", "hat", 0, base7, last);
  assert.ok(hat7 > snare6, `hat must follow the prior snare: ${snare6} -> ${hat7}`);
});

test("distinct voice groups are independent (no cross-voice clamping)", () => {
  const last = {};
  const base = 10;
  const synth = resolveEventTime("melody", "scale", 0, base, last);
  const kick = resolveEventTime("perc", "kick", 0, base, last);
  assert.equal(synth, base + 0);
  assert.equal(kick, base + 0);
});

test("dispatchEvents applies the guard and returns the sounding layers", () => {
  const calls = [];
  const voice = {
    synth: { triggerAttackRelease: (...a) => calls.push(["synth", a[2]]) },
    kick: { triggerAttackRelease: (...a) => calls.push(["kick", a[2]]) },
    hat: { triggerAttackRelease: (...a) => calls.push(["hat", a[1]]) },
  };
  const score = DEFAULT_PROJECT;
  const events = [
    { layerId: "m", kind: "scale", degree: 1, octave: 4, duration: "4n", offset: 0 },
  ];
  const last = {};
  const sounding = dispatchEvents({ score, voices: { m: voice }, events, time: 10, lastTimes: last });
  assert.deepEqual(sounding, ["m"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 10); // no bump needed for the first event
});

test("two same-offset notes on one voice are NEVER at the same time", () => {
  // The exact symptom from the field: a variation hat and a straight hat at
  // identical offset on the snareless perc voice.
  const last = {};
  const base = 100;
  const t1 = resolveEventTime("perc", "hat", 0.09, base, last);
  const t2 = resolveEventTime("perc", "hat", 0.09, base, last);
  assert.notEqual(t1, t2);
  assert.ok(t2 > t1);
});