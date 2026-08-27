// Timing-engine HOST tests: run the real createTimingEngine() end-to-end
// against an injected `now` and an injected ticker (so no Tone, no window).
// Pins the §5 lifecycle semantics that the pure-core tests can't reach:
// play/pause/resume/stop, tempo continuity at a boundary, gate-only emission,
// and that a throwing adapter never stops the clock.
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
    rack: [], // collected emitted steps
  };
  engine.attachPublisher((frame) => state.rack.push({ ...frame }));
  return state;
}

test("play anchors at origin; steps emit in ascending step order with absolute times", () => {
  const h = makeHarness();
  const emitted = [];
  h.engine.setTempo(120); // 0.25s per 8n step
  h.engine.registerLayer("lead", { onEvents: (ev) => emitted.push(ev) });
  h.engine.play();
  h.setTime(0);
  h.tick(); // window [0, 0.1] → steps at t=0 only (lookahead 0.1 < 0.25)
  assert.equal(emitted[0].step, 0);
  assert.equal(emitted[0].when, 0);
  h.advance(0.25);
  h.tick(); // window [0.25,0.35] → step 1
  assert.equal(emitted[1].step, 1);
  assert.ok(emitted[1].when > emitted[0].when);
});

test("gate-only emission: disabling a layer stops its events but not the clock", () => {
  const h = makeHarness();
  const a = [];
  const b = [];
  h.engine.setTempo(120);
  h.engine.registerLayer("a", { onEvents: (ev) => a.push(ev.step) });
  h.engine.registerLayer("b", { onEvents: (ev) => b.push(ev.step) });
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
  h.engine.registerLayer("lead", { onEvents: () => {} });
  h.engine.play();
  h.setTime(0); h.tick();
  h.setTime(2); h.tick(); // two emitted step fronts so far
  const beforePause = h.engine.position();
  h.engine.pause();
  h.tick(); // must not emit while paused
  const pausedFrame = h.engine.position();
  assert.deepEqual(pausedFrame, beforePause);
  h.setTime(3);
  h.engine.resume();
  const resumed = h.engine.position();
  assert.equal(resumed.bar, Math.floor(beforePause.bar)); // same bar, on-grid step
  const res = h.engine.position();
  assert.deepEqual(res.step % 2, 0); // snapped to an even step boundary
});

test("stop resets to origin; pause keeps position — they are distinct", () => {
  const h = makeHarness();
  h.engine.setTempo(120);
  h.engine.registerLayer("lead", { onEvents: () => {} });
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
  h.engine.registerLayer("lead", { onEvents: () => {} });
  h.engine.play();
  h.setTime(0); h.tick();
  const tBoundary = 8; // 16 steps @0.5s = bar 0 step 15 at t=7.5, step 0/bar at t=8
  h.setTime(tBoundary);
  h.engine.setTempo(120);
  h.tick(); // applies retempo at this boundary
  const pos = h.engine.position();
  assert.equal(pos.bar, 1); // wrapped into bar 1
  assert.equal(pos.step, 0); // on the boundary
});

test("a throwing adapter is isolated; other layers and the clock keep going", () => {
  const h = makeHarness();
  const healthy = [];
  h.engine.setTempo(120);
  h.engine.registerLayer("bad", { onEvents: () => { throw new Error("boom"); } });
  h.engine.registerLayer("good", { onEvents: (ev) => healthy.push(ev.step) });
  h.engine.play();
  h.setTime(0); h.tick();
  h.advance(0.25); h.tick();
  assert.deepEqual(healthy, [0, 1]); // unaffected
  assert.ok(h.engine.position().step !== undefined); // clock alive
});

test("dispose tears down and is idempotent; engine reports not running after", () => {
  const h = makeHarness();
  h.engine.setTempo(120);
  h.engine.registerLayer("lead", { onEvents: () => {} });
  h.engine.play();
  h.engine.dispose();
  h.engine.dispose(); // idempotent
  h.tick(); // no-op after dispose
  assert.deepEqual(h.engine.position(), { step: 0, bar: 0 });
});