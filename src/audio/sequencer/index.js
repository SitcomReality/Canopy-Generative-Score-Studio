// Orchestrates one step of a playback: called by the timing engine as the
// step source. Each step it reads the store's project, asks the shared
// dynamics core which events sound, gates them (mute/solo) at the emission
// boundary, triggers the layer voices, and applies bar-boundary arrangement
// (./arrangement.js) and one-shot flourishes (./flourish.js).
//
// The sequencer is the engine's *step adapter*: it owns WHAT plays and HOW it
// is realized, while the engine owns WHEN (the audio↔musical baseline, lookahead
// windows, the ticker). It therefore holds no timing counter — the engine hands
// it { step, bar, when } each call and musical position is derived from the
// audio clock, not accumulated here.
import {
  computeStepFrame,
  contextTargets,
  easeToward,
  orderEvents,
  FLOURISH_NAMES,
} from "../../music/dynamics.js";
import { applyBarStart, applyPhraseDrift } from "./arrangement.js";
import { dispatchEvents } from "./event-dispatch.js";
import { playFlourish } from "./flourish.js";
import {
  noteVoices,
  noteDurSec,
  roleOfLayer,
  activeVoiceCost,
  thinByBudget,
} from "./polyphony.js";

export function createSequencer({ store, voices, perfSteps, engine }) {
  // Long-form arrangement state: absolute bar count for the journey curve,
  // per-layer pass counters for rest windows, and the current quiet-pass
  // flags consulted by the step callback. These are MUSICAL (not timing) and
  // survive inside the sequencer; only the step counter is gone.
  let barCount = 0;
  let sectionId = null;
  const restCounter = {};
  const resting = {};
  // The live axis vector, eased toward the active context's targets each bar.
  let liveAxes = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
  let driftRng = Math.random; // seeded via setDriftRng on play
  // Per-voice last absolute start time, so the dispatch layer can enforce
  // Tone's strict-increase rule across every step (see ./event-dispatch.js).
  const lastTimes = {};
  // Voice budget: cap the number of simultaneous voices sustained by the mix so
  // a dense arrangement stays renderable on low-end machines. When a step would
  // push concurrent voices past `voiceBudget`, the lowest-priority events (fills,
  // ghost hats) are dropped first; structural downbeats/bass/harmony survive.
  // Deterministic given a fixed budget (thinning happens AFTER computeStepFrame,
  // so the seeded RNG stream is untouched).
  let voiceBudget = 20; // concurrent voices; tuned per-song/platform via setVoiceBudget
  const active = []; // { end: number, cost: number } for currently-sustaining voices

  const firstVoiceOf = (kind) =>
    store.get().project.layers.map((layer) => voices[layer.id]).find((voice) => voice.kind === kind);

  function computeFeatures(score) {
    const features = {};
    for (const layer of score.layers) {
      features[layer.id] = { steps: perfSteps[layer.id] ?? layer.steps };
    }
    return features;
  }

  function publish(frame, isBar, sounding) {
    // Preserve the app's existing playhead convention (step+1) so the visual
    // is unchanged from the old Tone.Transport path.
    if (isBar) store.set({ perfSteps: { ...perfSteps }, liveAxes: { ...liveAxes }, bar: barCount, sectionId });
    store.set({ step: (frame.step + 1) % 16, sounding });
  }

  // One step: called by the engine with { step, bar, when } where `when` is an
  // ABSOLUTE audio-context start time for the step's first 8th-note.
  function onEvents(frame) {
    const { step, when, bar } = frame;
    const score = store.get().project;
    let context = store.get().currentContext;
    const isBar = step === 0 || step === 8;
    const queuedContext = store.get().queuedContext;

    if (isBar && queuedContext) {
      context = queuedContext;
      store.set({ currentContext: context, queuedContext: null });
    }

    // Ease live axes toward the active context's targets every bar boundary.
    // v5: bpm stays at the song's written tempo — intensity expresses itself
    // through loudness, density, percussion and register instead.
    if (isBar) {
      liveAxes = easeToward(liveAxes, contextTargets(score, context), 0.5);
      applyPhraseDrift({ score, perfSteps, rng: driftRng });
    }

    if (step === 0) {
      barCount += 1;
      sectionId = applyBarStart({ score, voices, perfSteps, restCounter, resting, liveAxes, energyState: { barCount } });
    }

    // Feed the project runtime state the shared core needs to resolve events.
    const restingIds = score.layers.filter((layer) => resting[layer.id]).map((layer) => layer.id);
    const events = orderEvents(computeStepFrame(score, liveAxes, { features: computeFeatures(score), resting: restingIds }, step, driftRng));

    // GATE at the emission boundary: mute/solo filter whether an event hands
    // off to its voice. Generation (computeStepFrame) was unconditional, so a
    // muted layer's RNG stream is intact; only realization is skipped.
    let audible = events.filter((ev) => engine.isLayerAudible(ev.layerId));

    // VOICE BUDGET: retire voices that have finished, then thin this step's
    // events so concurrent voices stay under the budget. Dropping happens after
    // the RNG draw (mute/RNG-neutral), so a fixed budget stays deterministic.
    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i].end <= when) active.splice(i, 1);
    }
    audible = thinByBudget(audible, activeVoiceCost(active), voiceBudget, (layerId) => roleOfLayer(score, layerId));
    for (const ev of audible) {
      active.push({ end: when + noteDurSec(ev.duration, score.bpm), cost: noteVoices(ev) });
    }

    const sounding = dispatchEvents({ score, voices, events: audible, time: when, lastTimes });

    // One-shot flourish (v5): a queued game milestone plays across the next
    // bar via the lead voice and begins resolving the context it narrates at
    // that same boundary (end of the current bar / start of the next), so the
    // new character arrives promptly instead of a full bar later.
    if (isBar) {
      const queued = store.get().flourishQueued;
      if (queued && FLOURISH_NAMES.includes(queued)) {
        const lead = firstVoiceOf("melody") ?? firstVoiceOf("chords");
        const resolve = playFlourish({ score, leadVoice: lead, time: when, name: queued });
        store.set({ flourishQueued: null, currentContext: resolve, queuedContext: null });
        liveAxes = easeToward(liveAxes, contextTargets(score, resolve), 1);
      }
    }

    publish(frame, isBar, sounding);
    void bar; // bar is already reflected via `barCount`; kept for the signature
  }

  // Release in-flight voices on pause/stop. The engine's lookahead is small (a
  // fraction of a step), so any already-scheduled-but-not-yet-sounded attack is
  // at most one step ahead; releasing sustains prevents stuck notes. Short
  // plucks/percussion releases are no-ops.
  function onPause() {
    for (const voice of Object.values(voices)) {
      try {
        voice.synth?.releaseAll?.();
        voice.kick?.triggerRelease?.();
        voice.hat?.triggerRelease?.();
        voice.snare?.triggerRelease?.();
      } catch { /* already disposed or non-cancelable */ }
    }
  }

  return {
    attach() {
      engine.registerStep({ onEvents, onPause });
    },
    setDriftRng(rng) {
      driftRng = rng;
    },
    setVoiceBudget(budget) {
      voiceBudget = Math.max(1, budget);
    },
    getVoiceBudget() {
      return voiceBudget;
    },
    // Discard all arrangement/drift state so the next playback starts from
    // the score as written.
    reset() {
      barCount = 0;
      driftRng = Math.random;
      active.length = 0;
      Object.keys(lastTimes).forEach((id) => delete lastTimes[id]);
      Object.keys(restCounter).forEach((id) => delete restCounter[id]);
      Object.keys(resting).forEach((id) => delete resting[id]);
      for (const layer of store.get().project.layers) {
        if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
      }
      store.set({ step: 0, sounding: [], perfSteps: { ...perfSteps }, bar: 0, sectionId: null, flourishQueued: null });
    },
  };
}