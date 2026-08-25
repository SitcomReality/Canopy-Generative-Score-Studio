// Orchestrates the 16-step transport callback: reads the store's project each
// step, asks the shared dynamics core which events sound, triggers the layer
// voices (see ./event-dispatch.js), applies bar-boundary arrangement
// (./arrangement.js) and one-shot flourishes (./flourish.js), and publishes
// UI-visible state through Tone.Draw. All long-form state (bar count, rest
// windows, live axes, drifted phrases) lives here.
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

export function createSequencer({ store, voices, perfSteps }) {
  // Long-form arrangement state: absolute bar count for the journey curve,
  // per-layer pass counters for rest windows, and the current quiet-pass
  // flags consulted by the step callback.
  let barCount = 0;
  // Id of the active v5 section (verse), published to the UI each bar.
  let sectionId = null;
  const restCounter = {};
  const resting = {};
  // The live axis vector, eased toward the active context's targets each bar.
  let liveAxes = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
  // Seeded determinism: a non-zero variationSeed reproduces the same drift
  // sequence; 0 (the default) is fully random. Reset on each playback.
  let driftRng = Math.random;
  // Authoritative step index for the sequencer; mirrored to the store on
  // draw time purely for the UI.
  let stepIndex = 0;

  const firstVoiceOf = (kind) =>
    store.get().project.layers.map((layer) => voices[layer.id]).find((voice) => voice.kind === kind);

  function handleStep(time) {
    const score = store.get().project;
    let context = store.get().currentContext;
    // The step counter lives here, not in the store: UI publication happens
    // later (on draw time), so reading it back from the store would let a
    // delayed or dropped draw callback desync the music itself.
    const step = stepIndex;
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
    const features = {};
    for (const layer of score.layers) {
      features[layer.id] = { steps: perfSteps[layer.id] ?? layer.steps };
    }
    const events = orderEvents(computeStepFrame(score, liveAxes, { features, resting: restingIds }, step, driftRng));
    const sounding = dispatchEvents({ score, voices, events, time });

    // One-shot flourish (v5): a queued game milestone plays across this bar
    // via the lead voice, then resolves the context it narrates. All events
    // come from the shared catalog / per-song overrides in the project JSON.
    if (isBar) {
      const queued = store.get().flourishQueued;
      if (queued && FLOURISH_NAMES.includes(queued)) {
        const lead = firstVoiceOf("melody") ?? firstVoiceOf("chords");
        const resolve = playFlourish({ score, leadVoice: lead, time, name: queued });
        store.set({ flourishQueued: null, currentContext: resolve, queuedContext: null });
        liveAxes = easeToward(liveAxes, contextTargets(score, resolve), 1);
      }
    }

    // Publish the drifted phrases and live reactive state on bar boundaries so
    // the UI can overlay ghost notes, meter the axes, place the journey
    // playhead ("Generated variation" legend) and show the active verse.
    // UI-visible state goes through Tone.Draw: it fires on draw time (aligned
    // with what is heard) off the audio-scheduling path, and Tone clears it on
    // stop/pause so a stale callback can never resurrect an old step.
    Tone.Draw.schedule(() => {
      if (isBar) store.set({ perfSteps: { ...perfSteps }, liveAxes: { ...liveAxes }, bar: barCount, sectionId });
      store.set({ step: (step + 1) % 16, sounding });
    }, time);
    stepIndex = (step + 1) % 16;
  }

  return {
    handleStep,
    setDriftRng(rng) {
      driftRng = rng;
    },
    // Discard all arrangement/drift state so the next playback starts from
    // the score as written.
    reset() {
      barCount = 0;
      stepIndex = 0;
      driftRng = Math.random;
      Object.keys(restCounter).forEach((id) => delete restCounter[id]);
      Object.keys(resting).forEach((id) => delete resting[id]);
      for (const layer of store.get().project.layers) {
        if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
      }
      store.set({ step: 0, sounding: [], perfSteps: { ...perfSteps }, bar: 0, sectionId: null, flourishQueued: null });
    },
  };
}
