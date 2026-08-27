// Timing-engine tests: pin the pure scheduling arithmetic in src/timing/core.js
// and the timer-service bookkeeping against an INJECTED clock (no Tone, no DOM).
// Maps studioTimingEngineBrief.md §5 edge cases to cases:
//
//   1. toggle-storm stability      → effectiveGate must never touch baselines/RNG
//   (gating is a pure boolean filter; see also score-timing.test.js)
//   2. play-head re-entry          → snappedPosition / on-grid re-anchor
//   3. tempo change continuity     → retempoAt keeps pos continuous
//   4. tab suspension / long stall → dueSteps windows skip, never count ticks
//   5. looping wrap                → positionFrame modulo re-anchor
//   6. stop vs pause               → different baseline teardown semantics
//
// Plus the baseline mapping itself: musical position is a pure function of
// audio time, never accumulated counter state.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBaseline,
  beatsPerSecond,
  musicalPositionAt,
  stepDuration,
  stepStartTime,
  snappedPosition,
  reanchorAt,
  retempoAt,
  positionFrame,
  renderWindow,
  dueSteps,
  effectiveGate,
  STEPS_PER_BAR,
  STEPS_PER_BEAT,
} from "../../src/timing/core.js";
import { createTimerService } from "../../src/timing/timer-service.js";

// ------------------------- baseline mapping -------------------------------

test("musical position is a pure function of audio time (no counter)", () => {
  // bpm 60 → 1 beat/sec; anchored at audio 10s, musical 0.
  const base = createBaseline(10, 0, beatsPerSecond(60));
  assert.equal(musicalPositionAt(base, 11), 1);
  assert.equal(musicalPositionAt(base, 12), 2);
  // Jumping the clock far ahead must land correctly without any intermediate
  // ticks — the essence of "no accumulated callback counts".
  assert.equal(musicalPositionAt(base, 20), 10);
});

test("musicalRate is part of the baseline; tempo changes the slope", () => {
  const slow = createBaseline(0, 0, beatsPerSecond(60));
  const fast = createBaseline(0, 0, beatsPerSecond(120));
  assert.equal(musicalPositionAt(slow, 1), 1);
  assert.equal(musicalPositionAt(fast, 1), 2); // same audio second, twice the beats
  assert.equal(stepDuration(slow), 0.5); // 8n = half beat = 0.5s at 60bpm
  assert.equal(stepDuration(fast), 0.25);
});

test("stepStartTime grid: 16 steps map to exact 8n audio times", () => {
  const base = createBaseline(100, 0, beatsPerSecond(120)); // step = 0.25s
  assert.equal(stepStartTime(base, 0), 100);
  assert.equal(stepStartTime(base, 1), 100.25);
  assert.equal(stepStartTime(base, 16), 100 + 16 * 0.25);
  assert.equal(stepStartTime(base, -1), 99.75); // negative pre-roll is legal
});

// ------------------------- play-head re-entry (§5.2) -----------------------

test("snappedPosition rounds up to an on-grid step (re-entry lands on-grid)", () => {
  // 2 steps per beat → step boundaries every 0.5 beats.
  assert.equal(snappedPosition(0), 0);
  assert.equal(snappedPosition(0.5), 0.5);
  assert.equal(snappedPosition(0.51), 1);
  assert.equal(snappedPosition(1.3), 1.5);
  assert.equal(snappedPosition(4), 4);
});

test("reanchorAt keeps musical position continuous through pause/resume", () => {
  const base = createBaseline(0, 0, beatsPerSecond(90));
  // Pause at audio 2s → musical 3 beats. Resume at audio 5s must continue from 3,
  // not from 0.
  const pausedPos = musicalPositionAt(base, 2);
  assert.equal(pausedPos, 3);
  const resumed = reanchorAt(base, 5, pausedPos);
  assert.equal(musicalPositionAt(resumed, 5), 3);
  assert.equal(musicalPositionAt(resumed, 6), 4.5);
});

// ------------------------- tempo continuity (§5.3) ------------------------

test("retempoAt changes rate without moving musical position at the boundary", () => {
  const base = createBaseline(0, 0, beatsPerSecond(100));
  const t = 4; // boundary time
  const pos = musicalPositionAt(base, t);
  const next = retempoAt(base, t, pos, beatsPerSecond(140));
  // Continuous at the boundary...
  assert.equal(musicalPositionAt(next, t), pos);
  // ...and steeper afterward.
  assert.ok(musicalPositionAt(next, t + 1) > musicalPositionAt(base, t + 1));
});

// ------------------------- looping (§5.5) ---------------------------------

test("positionFrame re-anchors via modulo; bar count keeps advancing", () => {
  const base = createBaseline(0, 0, beatsPerSecond(120)); // 8 beats per bar loop
  // 16 steps = 8 beats per bar.
  assert.deepEqual(positionFrame(0), { step: 0, bar: 0 });
  assert.deepEqual(positionFrame(8), { step: 0, bar: 1 });
  assert.deepEqual(positionFrame(16), { step: 0, bar: 2 });
  assert.deepEqual(positionFrame(20), { step: 8, bar: 2 }); // mid-bar wrap
  assert.deepEqual(positionFrame(0.5), { step: 1, bar: 0 });
  assert.equal(STEPS_PER_BAR, 16);
  assert.equal(STEPS_PER_BEAT, 2);
});

// ------------------------- lookahead / stall (§5.4) -----------------------

test("renderWindow and dueSteps select ascending steps inside [now, now+lookahead]", () => {
  const base = createBaseline(100, 0, beatsPerSecond(120)); // 0.25s steps
  const win = renderWindow(100.6, 0.1); // [100.6, 100.7]
  // Step boundaries: step 2 @100.5 (before window), step 3 @100.75 (inside),
  // step 4 @101.0 (after). Only step 3 qualifies.
  // Shift to make 100.75 fall in-window: [100.7, 100.8] spans step 3.
  const win2 = renderWindow(100.7, 0.1);
  const steps = dueSteps(base, win2);
  assert.deepEqual(steps, [3]);
  assert.deepEqual(dueSteps(base, win), []); // narrow window between grid points
});

test("dueSteps is self-healing after a long stall: it derives steps from time, not tick counts", () => {
  const base = createBaseline(0, 0, beatsPerSecond(120));
  // A gap longer than lookahead: now jumps from 0 to 10s. The window must pick
  // the step covering now (10s → 40 steps), never replay or lose count.
  const win = renderWindow(10.0, 0.1);
  const steps = dueSteps(base, win);
  assert.equal(steps[0], 40); // 10 / 0.25
});

// ------------------------- gating (§5.1) ----------------------------------

test("effectiveGate is a pure boolean filter; mute/solo touch nothing else", () => {
  assert.equal(effectiveGate("a", true, null), true);
  assert.equal(effectiveGate("a", false, null), false); // muted
  assert.equal(effectiveGate("a", true, "b"), false); // else soloed
  assert.equal(effectiveGate("b", true, "b"), true); // the soloed one
  assert.equal(effectiveGate("b", false, "b"), false); // soloed but muted
});

// ------------------------- timer service ----------------------------------

test("timer tasks carry absolute fire times and cancel by flag", () => {
  let now = 0;
  const svc = createTimerService(() => now);
  const ran = [];
  const a = svc.setTimeout(() => ran.push("a"), 10);
  const b = svc.setTimeout(() => ran.push("b"), 5);
  svc.clearTimeout(a); // cancel-by-flag, not splice
  now = 6;
  const due = svc.fireDue(now);
  assert.equal(due.length, 1); // only b is due; a was cancelled by flag
  due.forEach((t) => t.fn());
  assert.deepEqual(ran, ["b"]);
});

test("interval tasks reschedule to the next cycle; errors isolated by host", () => {
  let now = 0;
  const svc = createTimerService(() => now);
  const fires = [];
  const id = svc.setInterval(() => fires.push(now), 5);
  now = 5;
  let due = svc.fireDue(now);
  assert.equal(due.length, 1);
  const next = svc.reschedule(due[0]);
  assert.equal(next.fireTime, 10);
  svc.clearInterval(id);
  now = 10;
  due = svc.fireDue(now);
  assert.equal(due.length, 0); // cancelled by flag
});

test("wait resolves via a one-shot task", () => {
  let now = 0;
  const svc = createTimerService(() => now);
  let resolved = false;
  svc.wait(3).then(() => { resolved = true; });
  now = 3;
  const due = svc.fireDue(now);
  due.forEach((t) => t.fn());
  return Promise.resolve().then(() => assert.equal(resolved, true));
});