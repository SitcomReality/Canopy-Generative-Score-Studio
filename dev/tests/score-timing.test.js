// Timing-order gate: Tone requires each voice's triggerAttackRelease start
// times to strictly increase in call order, or it throws "Start time must be
// strictly greater than previous start time". computeStepFrame's emission
// order is not time order (variation hats, snare rolls, snare->hat fallback),
// so hosts must pass events through orderEvents() before triggering. These
// tests pin that guard so a re-exported .score.js can never ship without it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStepFrame, orderEvents } from "../../src/music/dynamics.js";
import { scoreEngineSource } from "../../src/music/runtime-module.js";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";

// Offsets within each physical voice (pitched synth / kick / perc-noise,
// where snare may fall back to the hat) must strictly increase in call order.
function assertVoiceOrder(events, label) {
  const last = {};
  for (const ev of events) {
    const group = ev.kind === "chord" || ev.kind === "scale"
      ? "synth"
      : ev.kind === "kick"
        ? "kick"
        : "perc"; // hat and snare may share one NoiseSynth
    const key = `${ev.layerId}|${group}`;
    const offset = ev.offset ?? 0;
    if (key in last) {
      assert.ok(
        offset > last[key],
        `${label}: ${key} event at offset ${offset} does not follow ${last[key]}`,
      );
    }
    last[key] = offset;
  }
}

test("orderEvents fixes a variation hat drawn before the straight hat", () => {
  const inverted = [
    { layerId: "drums", kind: "hat", duration: "32n", velocity: 0.16, offset: 0 },
    { layerId: "drums", kind: "hat", duration: "32n", velocity: 0.16, offset: 0 }, // variation hat, smaller humanize
  ];
  assert.deepEqual(orderEvents(inverted).map((ev) => ev.offset), [0, 0]);
  // Strictly increasing when the second draw is actually smaller:
  const inverted2 = [
    { layerId: "d", kind: "snare", offset: 0.09 },
    { layerId: "d", kind: "hat", offset: 0.02 }, // same perc voice on snareless kits
    { layerId: "d", kind: "snare", offset: 0.045 },
  ];
  assert.deepEqual(orderEvents(inverted2).map((ev) => ev.offset), [0.02, 0.045, 0.09]);
});

test("orderEvents sorts globally by offset (cross-voice call order is free)", () => {
  const events = [
    { layerId: "a", kind: "kick", offset: 0.05 },
    { layerId: "b", kind: "scale", degree: 1, offset: 0 },
    { layerId: "a", kind: "hat", offset: 0.02 },
  ];
  const ordered = orderEvents(events);
  assert.deepEqual(ordered.map((ev) => ev.offset), [0, 0.02, 0.05]);
});

test("orderEvents is stable for equal offsets and does not mutate input", () => {
  const events = [
    { layerId: "x", kind: "snare", offset: 0.02, tag: 1 },
    { layerId: "x", kind: "snare", offset: 0.02, tag: 2 },
  ];
  const ordered = orderEvents(events);
  assert.deepEqual(ordered.map((ev) => ev.tag), [1, 2]);
  assert.equal(events.length, 2);
});

const HIGH_INTENSITY = { intensity: 1, tension: 0.9, brightness: 0.8 };

for (let step = 0; step < 16; step += 1) {
  test(`combat-step ${step}: ordered events are per-voice time-ordered`, () => {
    let rngState = 42 + step;
    const rng = () => {
      // Deterministic LCG so the case is reproducible across runs.
      rngState = (rngState * 1103515245 + 12345) % 2147483648;
      return rngState / 2147483648;
    };
    const raw = computeStepFrame(DEFAULT_PROJECT, HIGH_INTENSITY, {}, step, rng);
    assertVoiceOrder(orderEvents(raw), `step ${step}`);
  });
}

test("emitted runtime orders events through orderEvents (parity of the guard)", () => {
  const emitted = scoreEngineSource();
  assert.match(emitted, /orderEvents\(computeStepFrame\(/, "runtime step loop must wrap events in orderEvents");
});
