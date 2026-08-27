// Timing engine host: the studio's single time authority. Composes the pure
// core (./core.js) and timer service (./timer-service.js) behind one public
// API, supplies the real audio clock (Tone.now()) and the one coarse ticker,
// and owns the baseline mapping. This is the ONLY site allowed to create raw
// timers (see Rules in index.md); every timed thing in the app routes here.
//
// The engine owns *when* (the audio→musical baseline, lookahead windows, the
// ticker) and *whether* (per-layer gates for mute/solo). A single "step
// source" adapter — the sequencer — computes+realizes each step's events. It
// is called once per due step with an ABSOLUTE audio-context start time and
// consults isLayerAudible() at the emission boundary so a muted layer's RNG
// stream is still consumed (gate-only, never generation).
//
// Gating is a pure boolean filter. A toggle must never cancel, restart, or
// re-anchor anything; playback flows identically through every mute/solo.
import {
  createBaseline,
  beatsPerSecond,
  musicalPositionAt,
  stepStartTime,
  stepDuration,
  snappedPosition,
  reanchorAt,
  retempoAt,
  positionFrame,
  renderWindow,
  dueSteps,
  effectiveGate,
} from "./core.js";
import { createTimerService } from "./timer-service.js";
import { createGovernor } from "./governor.js";

const LOOKAHEAD = 0.1; // seconds of event window pushed ahead each tick
const TICK_MS = 25; // coarse ticker cadence (rAF acceptable; interval used here)

export function createTimingEngine({ now, ticker, frame } = {}) {
  // Injected clock/ticker so the same engine runs under node:test with no
  // Tone present; defaults point at the real audio clock + a host interval.
  const provideNow = now ?? (() => Tone.now());
  const provideTicker = ticker ?? ((fn) => window.setInterval(fn, TICK_MS));
  const provideFrame = frame ?? ((fn) => window.requestAnimationFrame(fn));

  const timer = createTimerService(() => provideNow() * 1000);
  const gates = new Map(); // layerId -> boolean enabled (undefined = enabled)
  let soloedId = null; // at most one solo holds in this studio UI

  let baseline = null; // { audioOrigin, musicalOrigin, musicalRate } | null
  let heldPosition = null; // musical position retained across pause (null = not paused)
  let tickerId = null;
  let disposed = false;
  let bpm = 120; // current musical rate target (beats/min)
  let swing = 0; // 0 = straight; delays off-beat 8ths (odd steps) for a swung feel
  let deferredBpm = null; // bpm queued for the next half-bar boundary
  let onBarBoundary = null; // sequencer hook for arrangement/context at step 0
  let stepSource = null; // { onEvents(frame), onPause() } | null
  let publisher = null; // (frame) => void, set by the host to publish UI position
  let initialWindow = false; // first tick after (re)anchor starts the window at the anchor
  let onGovern = null; // (budget) => void, set by the host to apply adaptive thinning
  // Adaptive voice budget: when a tick must catch up 2+ steps, the main thread
  // is falling behind; shrink the budget so the mix thins itself under load.
  const governor = createGovernor(20, { min: 8, max: 32 });

  // ---- audio-time source ------------------------------------------------

  // The injected clock (or Tone.now()). Never read to anchor or schedule
  // while the AudioContext is suspended (§5.7); clockReady() gates that.
  function audioNow() {
    return provideNow();
  }

  function clockReady() {
    const ctx = typeof Tone !== "undefined" ? Tone.getContext() : null;
    if (ctx && ctx.rawContext && ctx.rawContext.state !== "running") return false;
    return true;
  }

  // ---- the single tick loop --------------------------------------------

  function tick() {
    if (disposed) return;
    const t = audioNow();

    // Drain due timer-service tasks (toast / render-batch / harness polls /
    // recording readout). These are app-wide and run regardless of whether the
    // musical transport is playing, so this is done before the baseline guard.
    // (When the AudioContext is suspended, audioNow() is frozen and tasks that
    // were scheduled on it simply wait — acceptable, since UI timers are only
    // set while the context is running.)
    const due = timer.fireDue(t * 1000);
    for (const task of due) {
      try {
        task.fn();
      } catch (err) {
        console.error("[timing] timer error:", err);
      }
      const next = timer.reschedule(task);
      if (next) timer.add(next); // re-arm repeating tasks for the next cycle
    }

    // Musical lookahead dispatch runs only while playing and the audio context
    // is trustworthy. It never runs off a counter: position comes from the
    // baseline map and the injected audio clock.
    if (!baseline || !clockReady()) return;

    // Tempo change lands here at a musical boundary: re-anchor at the next
    // half-bar (step 0 or 8) so position stays continuous, never mid-chord.
    if (deferredBpm !== null) {
      const pos = musicalPositionAt(baseline, t);
      const frame = positionFrame(pos);
      if (frame.step === 0 || frame.step === 8) {
        baseline = retempoAt(baseline, t, pos, beatsPerSecond(deferredBpm));
        bpm = deferredBpm;
        deferredBpm = null;
      }
    }

    // First tick after a (re)anchor opens its window at the anchor point so the
    // just-started step (0 or the resume step) is never skipped, even though the
    // ticker fires up to TICK_MS after play/resume set the baseline.
    const win = initialWindow
      ? renderWindow(baseline.audioOrigin, LOOKAHEAD)
      : renderWindow(t, LOOKAHEAD);
    initialWindow = false;
    const steps = dueSteps(baseline, win);

    // Adaptive governor: a tick that must catch up 2+ steps means the main
    // thread is behind the audio clock; suggest a tighter voice budget so the
    // mix thins itself (see ./governor.js).
    if (onGovern) {
      const suggested = governor.observe(steps.length >= 2);
      if (suggested !== null) {
        try {
          onGovern(suggested);
        } catch (err) {
          console.error("[timing] governor error:", err);
        }
      }
    }

    for (const stepIndex of steps) {
      // Off-beat 8ths (odd steps) are delayed by the swing amount for a swung
      // feel; even steps (the on-beat) stay on the grid.
      const when = stepStartTime(baseline, stepIndex) + (stepIndex % 2 === 1 ? swing * stepDuration(baseline) : 0);
      const frame = positionFrame(musicalPositionAt(baseline, when));

      // Bar boundary: let the sequencer run arrangement/context transitions.
      if (frame.step === 0 && onBarBoundary) {
        try {
          onBarBoundary(frame.bar, when);
        } catch (err) {
          console.error("[timing] boundary error:", err);
        }
      }

      // Dispatch the step to the sequencer, which computes, gates, and
      // realizes. A throwing source must not stop the clock or starve others.
      if (stepSource) {
        try {
          stepSource.onEvents({ step: frame.step, bar: frame.bar, when });
        } catch (err) {
          console.error("[timing] step source error:", err);
        }
      }

      publisher?.(frame);
    }
  }

  // ---- lifecycle --------------------------------------------------------

  function play() {
    if (disposed) return;
    // A tempo set before play (e.g. from the project on engine start) must be
    // honored as the initial rate, not deferred to a boundary that never comes.
    if (deferredBpm !== null) {
      bpm = deferredBpm;
      deferredBpm = null;
    }
    // Anchor AFTER unlock: the calling host awaits Tone.start() first (§5.7).
    // A null baseline means cold start from musical origin 0. The first tick
    // uses an anchor-wide window so step 0 is scheduled even though the ticker
    // fires up to TICK_MS after this. The ticker itself already runs for app
    // timers; only the baseline distinguishes playing from idle.
    baseline = createBaseline(audioNow(), 0, beatsPerSecond(bpm));
    heldPosition = null;
    initialWindow = true;
    ensureTicker();
  }

  function pause() {
    if (!baseline) return;
    // Hold musical position, then revoke the lookahead: null the baseline so
    // no further events emit (musical dispatch halts even though the ticker
    // stays up for app timers), then let the source release in-flight handles.
    heldPosition = musicalPositionAt(baseline, audioNow());
    baseline = null;
    releaseInFlight();
  }

  function resume() {
    if (heldPosition === null) return;
    baseline = createBaseline(audioNow(), snappedPosition(heldPosition), beatsPerSecond(bpm));
    heldPosition = null;
    initialWindow = true;
    ensureTicker();
  }

  function stop() {
    // Distinct from pause: clear the baseline, return to origin, and reset
    // long-form state. The sequencer resets its own arrangement state via its
    // onPause / a next-start reset.
    releaseInFlight();
    baseline = null;
    heldPosition = null;
    publisher?.({ step: 0, bar: 0 });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopTicker();
    releaseInFlight();
    baseline = null;
    heldPosition = null;
    deferredBpm = null;
    onBarBoundary = null;
    stepSource = null;
    publisher = null;
    onGovern = null;
    timer.clear();
    gates.clear();
    soloedId = null;
  }

  // The ticker is the ONE source of app-wide ticks. It is started lazily (by
  // play/resume or any app timer registration) and kept running until dispose,
  // so UI timers keep firing even when transport is stopped/paused.
  function ensureTicker() {
    if (disposed || tickerId !== null) return;
    tickerId = provideTicker(tick);
  }

  function stopTicker() {
    if (tickerId === null) return;
    if (typeof window !== "undefined" && window.clearInterval) window.clearInterval(tickerId);
    tickerId = null;
  }

  function releaseInFlight() {
    try {
      stepSource?.onPause?.();
    } catch (err) {
      console.error("[timing] release error:", err);
    }
  }

  // ---- step source + gates ---------------------------------------------

  function registerStep(source) {
    stepSource = source;
  }

  function isLayerAudible(layerId) {
    return effectiveGate(layerId, gates.get(layerId) !== false, soloedId);
  }

  function setLayerEnabled(layerId, enabled) {
    gates.set(layerId, enabled);
  }

  function setLayerSolo(layerId) {
    soloedId = layerId;
  }

  function clearSolo() {
    soloedId = null;
  }

  function registerBarBoundary(fn) {
    onBarBoundary = fn;
  }

  function attachPublisher(fn) {
    publisher = fn;
  }

  // Register the adaptive voice-budget governor callback (the host adjusts the
  // sequencer's budget). Pass null to disable adaptive thinning.
  function setGovernor(fn) {
    onGovern = fn;
  }

  // ---- tempo / seek -----------------------------------------------------

  function setTempo(nextBpm) {
    // Defer the scheduled re-anchor to the next half-bar boundary rather than
    // jumping immediately; the tick loop applies it (see tick()).
    deferredBpm = nextBpm;
  }

  function setSwing(value) {
    swing = value;
  }

  function tempoNow() {
    return deferredBpm ?? bpm;
  }

  function setPosition(musicalPos) {
    if (!baseline) return;
    baseline = reanchorAt(baseline, audioNow(), snappedPosition(musicalPos));
  }

  // ---- queries ----------------------------------------------------------

  function position() {
    if (baseline) return positionFrame(musicalPositionAt(baseline, audioNow()));
    if (heldPosition !== null) return positionFrame(heldPosition);
    return positionFrame(0);
  }

  const api = {
    play,
    pause,
    resume,
    stop,
    dispose,
    registerStep,
    registerBarBoundary,
    attachPublisher,
    setGovernor,
    isLayerAudible,
    setLayerEnabled,
    setLayerSolo,
    clearSolo,
    setTempo,
    setSwing,
    setPosition,
    position,
    audioNow,
    tempoNow,
    bpm: () => bpm,
    // Timer service surface (app-wide timers route here). Registering a timer
    // starts the shared ticker lazily so it runs even before playback begins.
    setTimeout: (fn, ms) => { ensureTicker(); return timer.setTimeout(fn, ms); },
    clearTimeout: (id) => timer.clearTimeout(id),
    setInterval: (fn, ms) => { ensureTicker(); return timer.setInterval(fn, ms); },
    clearInterval: (id) => timer.clearInterval(id),
    wait: (ms) => { ensureTicker(); return timer.wait(ms); },
    onFrame(fn) {
      let id = null;
      const loop = (ts) => {
        if (disposed) return;
        fn(ts);
        id = provideFrame(loop);
      };
      id = provideFrame(loop);
      return () => {
        if (id !== null && typeof window !== "undefined" && window.cancelAnimationFrame) window.cancelAnimationFrame(id);
        id = null;
      };
    },
  };

  return api;
}

let singleton = null;
export function getTimingEngine() {
  if (!singleton) singleton = createTimingEngine();
  return singleton;
}