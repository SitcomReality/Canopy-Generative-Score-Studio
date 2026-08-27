// Timing engine host: the studio's single time authority. Composes the pure
// core (./core.js) and timer service (./timer-service.js) behind one public
// API, supplies the real audio clock (Tone.now()) and the one coarse ticker,
// and owns the baseline mapping. This is the ONLY site allowed to create raw
// timers (see Rules in index.md); every timed thing in the app routes here.
//
// The engine owns *when*; layer adapters own *what* and *how*. Adapters
// implement onEvents(events, when) — they receive the step being sounded and
// its absolute audio-context start time — and are responsible for resolving
// events (via computeStepFrame/orderEvents) and realizing them on voices,
// resolving same-voice collisions, and owning revocable handles. Gating
// (mute/solo) lives at the emission boundary here and must never touch
// baselines or the RNG stream.
import {
  createBaseline,
  beatsPerSecond,
  musicalPositionAt,
  stepStartTime,
  snappedPosition,
  reanchorAt,
  retempoAt,
  positionFrame,
  renderWindow,
  dueSteps,
  effectiveGate,
} from "./core.js";
import { createTimerService } from "./timer-service.js";

const LOOKAHEAD = 0.1; // seconds of event window pushed ahead each tick
const TICK_MS = 25; // coarse ticker cadence (rAF acceptable; interval used here)

export function createTimingEngine({ now, ticker, frame } = {}) {
  // Injected clock/ticker so the same engine runs under node:test with no
  // Tone present; defaults point at the real audio clock + a host interval.
  const provideNow = now ?? (() => Tone.now());
  const provideTicker = ticker ?? ((fn) => window.setInterval(fn, TICK_MS));
  const provideFrame = frame ?? ((fn) => window.requestAnimationFrame(fn));

  const timer = createTimerService(() => provideNow() * 1000);
  const adapters = new Map(); // layerId -> { onEvents, onPause, enabled }
  let soloedId = null; // at most one solo holds in this studio UI

  let baseline = null; // { audioOrigin, musicalOrigin, musicalRate } | null
  let heldPosition = null; // musical position retained across pause (null = not paused)
  let tickerId = null;
  let disposed = false;
  let bpm = 120; // current musical rate target (beats/min)
  let deferredBpm = null; // bpm queued for the next half-bar boundary
  let onBarBoundary = null; // sequencer hook for arrangement/context at step 0

  let publisher = null; // (frame) => void, set by the host to publish UI position

  // ---- audio-time source ------------------------------------------------

  // Musically-safe clock read: the injected clock (or Tone.now()). Never read
  // to anchor or schedule while the AudioContext is suspended (§5.7).
  function audioNow() {
    return provideNow();
  }

  // Whether the audio clock is trustworthy. While the AudioContext is
  // suspended its currentTime does not advance, so we hold off scheduling.
  function clockReady() {
    const ctx = typeof Tone !== "undefined" ? Tone.getContext() : null;
    if (ctx && ctx.rawContext && ctx.rawContext.state !== "running") return false;
    return true;
  }

  // ---- the single tick loop --------------------------------------------

  function tick() {
    if (disposed || !baseline || !clockReady()) return;

    // Tempo change lands here at a musical boundary: re-anchor at the next
    // half-bar (step 0 or 8) so position stays continuous, never mid-chord.
    if (deferredBpm !== null) {
      const t = audioNow();
      const pos = musicalPositionAt(baseline, t);
      const frame = positionFrame(pos);
      if (frame.step === 0 || frame.step === 8) {
        baseline = retempoAt(baseline, t, pos, beatsPerSecond(deferredBpm));
        bpm = deferredBpm;
        deferredBpm = null;
      }
    }

    const t = audioNow();
    const win = renderWindow(t, LOOKAHEAD);
    const steps = dueSteps(baseline, win);

    for (const stepIndex of steps) {
      const when = stepStartTime(baseline, stepIndex);
      const frame = positionFrame(musicalPositionAt(baseline, when));

      // Bar boundary: let the sequencer run arrangement/context transitions.
      if (frame.step === 0 && onBarBoundary) {
        try {
          onBarBoundary(frame.bar, when);
        } catch (err) {
          console.error("[timing] boundary error:", err);
        }
      }

      // Emit the step through each adapter's gate.
      for (const [layerId, adapter] of adapters) {
        if (!effectiveGate(layerId, adapter.enabled, soloedId)) continue;
        try {
          adapter.onEvents({ step: frame.step, bar: frame.bar, when });
        } catch (err) {
          // A throwing adapter must not stop the clock or starve other layers.
          console.error("[timing] adapter error:", err);
        }
      }

      publisher?.(frame);
    }

    // Drain due timer-service tasks (toast/render-batch/harness polls).
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
  }

  // ---- lifecycle --------------------------------------------------------

  function play(rng) {
    if (disposed) return;
    // A tempo set before play (e.g. from the project on engine start) must be
    // honored as the initial rate, not deferred to a boundary that never comes.
    if (deferredBpm !== null) {
      bpm = deferredBpm;
      deferredBpm = null;
    }
    // Anchor AFTER unlock: the calling host awaits Tone.start() first (§5.7).
    // A null baseline means cold start from musical origin 0.
    baseline = createBaseline(audioNow(), 0, beatsPerSecond(bpm));
    heldPosition = null;
    startTicker();
  }

  function pause() {
    if (!baseline) return;
    // Hold musical position, then revoke the lookahead: stop ticking first so
    // no further events emit, then let adapters release in-flight handles.
    stopTicker();
    heldPosition = musicalPositionAt(baseline, audioNow());
    baseline = null;
    releaseInFlight();
  }

  function resume() {
    if (heldPosition === null) return;
    baseline = createBaseline(audioNow(), snappedPosition(heldPosition), beatsPerSecond(bpm));
    heldPosition = null;
    startTicker();
  }

  function stop() {
    // Distinct from pause: clear the baseline, return to origin, and reset
    // long-form state. The sequencer resets its own arrangement state via
    // onBarBoundary teardown on the next start.
    stopTicker();
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
    publisher = null;
    timer.clear();
    adapters.clear();
    soloedId = null;
  }

  function startTicker() {
    if (tickerId !== null) return;
    tickerId = provideTicker(tick);
  }

  function stopTicker() {
    if (tickerId === null) return;
    if (typeof window !== "undefined" && window.clearInterval) window.clearInterval(tickerId);
    tickerId = null;
  }

  function releaseInFlight() {
    for (const adapter of adapters.values()) {
      try {
        adapter.onPause?.();
      } catch (err) {
        console.error("[timing] release error:", err);
      }
    }
  }

  // ---- adapters ---------------------------------------------------------

  function registerLayer(layerId, adapter) {
    adapters.set(layerId, {
      onEvents: adapter.onEvents,
      onPause: adapter.onPause,
      enabled: adapter.enabled !== false,
    });
  }

  function setLayerEnabled(layerId, enabled) {
    const adapter = adapters.get(layerId);
    if (adapter) adapter.enabled = enabled;
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

  // ---- tempo / seek -----------------------------------------------------

  function setTempo(nextBpm) {
    // Defer the scheduled re-anchor to the next half-bar boundary rather than
    // jumping immediately; the tick loop applies it (see tick()).
    deferredBpm = nextBpm;
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

  const baseTempo = () => bpm;

  const api = {
    play,
    pause,
    resume,
    stop,
    dispose,
    registerLayer,
    setLayerEnabled,
    setLayerSolo,
    clearSolo,
    setTempo,
    setPosition,
    registerBarBoundary,
    attachPublisher,
    position,
    audioNow,
    tempoNow,
    bpm: baseTempo,
    // Timer service surface (app-wide timers route here).
    setTimeout: (fn, ms) => timer.setTimeout(fn, ms),
    clearTimeout: (id) => timer.clearTimeout(id),
    setInterval: (fn, ms) => timer.setInterval(fn, ms),
    clearInterval: (id) => timer.clearInterval(id),
    wait: (ms) => timer.wait(ms),
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