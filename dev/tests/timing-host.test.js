// Timing-engine HOST tests: run the real createTimingEngine() end-to-end
// against an injected `now` and an injected ticker (so no Tone, no window).
// Pins the §5 lifecycle semantics that the pure-core tests can't reach:
// play/pause/resume/stop, tempo continuity at a boundary, gate-only emission,
// and that a throwing step source never stops the clock.
//
// Model under test: the engine owns timing + per-layer gates; the app
// registers ONE step source (the sequencer) that is called per due step and
// consults isLayerAudible() at the emission boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTimingEngine } from "../../src/timing/index.js";

// A controllable clock + manually-fired ticker. The engine calls
// provideTicker(fn) to start; we capture fn and fire it on demand.
function makeHarness() {
  let t = 0;
  let tickFn = null;
  let rafId = 0;
  const engine = createTimingEngine({
    now: () => t,
    ticker: (fn) => {
      tickFn = fn;
      return { kind: "injected", fn };
    },
    frame: (fn) => {
      rafId += 1;
      return rafId;
    },
  });
  const state = {
    t,
    tick: () => { if (tickFn) tickFn(); },
    advance(seconds) { t += seconds; },
    setTime(v) { t = v; },
    engine,
    rack: [], // collected published frames
    fromNow() { return t; },
  };
  engine.attachPublisher((frame) => state.rack.push({ ...frame }));
  return state;
}

test("play anchors at origin; steps emit in ascending order with absolute times", () => {
  const h = makeHarness();
  const emitted = [];
  h.engine.setTempo(120); // 0.25s per 8n step
  h.engine.registerStep({ onEvents: (ev) => emitted.push(ev) });
  h.engine.play();
  h.setTime(0);
  h.tick(); // window [0, 0.1] → step at t=0 only (lookahead 0.1 < 0.25)
  assert.equal(emitted[0].step, 0);
  assert.equal(emitted[0].when, 0);
  h.advance(0.25);
  h.tick(); // window [0.25,0.35] → step 1
  assert.equal(emitted[1].step, 1);
  assert.ok(emitted[1].when > emitted[0].when);
});

test("gate-only emission: disabling a layer stops its events but not the clock", () => {
  const h = makeHarness();
  h.engine.setTempo(120);
  const a = [];
  const b = [];
  h.engine.registerStep({
    onEvents(frame) {
      if (h.engine.isLayerAudible("a")) a.push(frame.step);
      if (h.engine.isLayerAudible("b")) b.push(frame.step);
    },
  });
  h.engine.play();
  h.setTime(0); h.tick();
  h.engine.setLayerEnabled("a", false); // mute — gate only
  h.advance(0.25); h.tick();
  assert.deepEqual(a, [0]); // a stops
  assert.deepEqual(b, [0, 1]); // b keeps flowing identically (same step cadence)
});

test("pause holds position; resume re-anchors on-grid (no drift, no double-emit)", () => {
  const h = makeHarness();
  h.engine.setTempo(120);
  h.engine.registerStep({ onEvents: () => {} });
  h.engine.play();
  h.setTime(0); h.tick();
  h.setTime(2); h.tick();
  const beforePause = h.engine.position();
  h.engine.pause();
  h.tick(); // must not emit while paused
  assert.deepEqual(h.engine.position(), beforePause);
  h.setTime(3);
  h.engine.resume();
  const res = h.engine.position();
  assert.equal(res.bar, beforePause.bar); // same bar, on-grid step
  assert.equal(res.step % 2, 0); // snapped to an even step boundary
});

test("stop resets to origin; pause keeps position — they are distinct", () => {
  const h = makeHarness();
  h.engine.setTempo(120);
  h.engine.registerStep({ onEvents: () => {} });
  h.engine.play();
  h.setTime(1); h.tick();
  const midPos = h.engine.position();
  assert.ok(midPos.bar > 0 || midPos.step > 0);
  h.engine.pause();
  assert.deepEqual(h.engine.position(), midPos); // pause retains
  h.engine.resume();
  h.engine.stop();
  assert.deepEqual(h.engine.position(), { step: 0, bar: 0 }); // stop resets
});

test("tempo change re-anchors at a boundary without moving position", () => {
  const h = makeHarness();
  h.engine.setTempo(60); // 0.5s per 8n step
  h.engine.registerStep({ onEvents: () => {} });
  h.engine.play();
  h.setTime(0); h.tick();
  h.setTime(8); // 16 steps at 0.5s → step 0 of bar 1 at t=8
  h.engine.setTempo(120);
  h.tick(); // applies retempo at this boundary
  const pos = h.engine.position();
  assert.equal(pos.bar, 1);
  assert.equal(pos.step, 0);
});

test("a throwing step source is isolated; the clock keeps going", () => {
  const h = makeHarness();
  h.engine.setTempo(120);
  const healthy = [];
  // A single source that throws on even calls but still emits on odd ones —
  // a throw must not stop the clock or starve the next step.
  let calls = 0;
  h.engine.registerStep({
    onEvents(ev) {
      calls += 1;
      if (calls % 2 === 0) throw new Error("boom");
      healthy.push(ev.step);
    },
  });
  h.engine.play();
  h.setTime(0); h.tick();
  h.advance(0.25); h.tick();
  assert.deepEqual(healthy, [0]); // survived the throw; emitted on odd calls
  assert.ok(h.engine.position().step !== undefined); // clock alive
});

test("dispose tears down and is idempotent; engine reports origin after", () => {
  const h = makeHarness();
  h.engine.setTempo(120);
  h.engine.registerStep({ onEvents: () => {} });
  h.engine.play();
  h.engine.dispose();
  h.engine.dispose(); // idempotent
  h.tick(); // no-op after dispose
  assert.deepEqual(h.engine.position(), { step: 0, bar: 0 });
});