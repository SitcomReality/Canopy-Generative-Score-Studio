// The 16-step transport callback: reads the store's project each step, asks
// the shared dynamics core which events sound, triggers the layer voices,
// and publishes UI-visible state through Tone.Draw. All long-form state
// (bar count, rest windows, live axes, drifted phrases) lives here.
import {
  computeStepFrame,
  contextTargets,
  easeToward,
  journeyGain,
  layerActive,
  orderEvents,
  activeSection,
  sectionGain,
  sectionActive,
  layerLevel,
  flourishEvents,
  FLOURISH_NAMES,
} from "../music/dynamics.js";
import { midiToNote } from "../music/note-names.js";
import { scaleMidi, chordNotes } from "../music/scale-math.js";
import { mutateMotif } from "../music/variation.js";
import { journeyEnergy } from "../music/variation.js";

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
    }

    // Bar-boundary phrase drift for motif layers (long-form variation).
    if (isBar) {
      for (const layer of score.layers) {
        if (layer.role === "motif" && !layer.muted && layer.variation > 0) {
          perfSteps[layer.id] = mutateMotif(layer.steps, layer.variation, driftRng);
        }
      }
    }

    // Macro journey + arrangement energy, applied once per bar. The v5
    // section (verse) rotation adds a per-layer dB delta and can drop layers
    // in/out for the length of the section.
    if (step === 0) {
      barCount += 1;
      const journey = score.journey ?? { shape: "flat", length: 16, depth: 0 };
      const energy = journeyEnergy(journey.shape, journey.depth, barCount, journey.length);
      const section = activeSection(score, barCount);
      sectionId = section?.id ?? null;
      for (const layer of score.layers) {
        restCounter[layer.id] = (restCounter[layer.id] ?? 0) + 1;
        const window = layer.restWindow ?? 0;
        resting[layer.id] =
          (window > 0 && restCounter[layer.id] % (window + 1) === 0) || !sectionActive(section, layer.id);
        const voice = voices[layer.id];
        if (!voice || layer.muted || resting[layer.id] || !layerActive(layer, liveAxes)) continue;
        // Total loudness bias = journey role bias + static trim + verse delta.
        const delta = journeyGain(layer, energy) + layerLevel(layer) + sectionGain(section, layer.id);
        if (voice.kind === "drums") {
          voice.kick.volume.rampTo(-10 + delta, 0.8);
          voice.hat.volume.rampTo(-24 + delta, 0.8);
          if (voice.snare) voice.snare.volume.rampTo(-14 + delta, 0.8);
        } else {
          const base = voice.kind === "chords" ? -16 : voice.kind === "melody" ? -9 : -11;
          voice.synth.volume.rampTo(Math.max(-40, Math.min(0, base + delta)), 0.8);
        }
      }
    }

    // Feed the project runtime state the shared core needs to resolve events.
    const restingIds = score.layers.filter((layer) => resting[layer.id]).map((layer) => layer.id);
    const features = {};
    for (const layer of score.layers) {
      features[layer.id] = { steps: perfSteps[layer.id] ?? layer.steps };
    }
    const events = orderEvents(computeStepFrame(score, liveAxes, { features, resting: restingIds }, step, driftRng));

    // Layer ids that actually sound this step, for the UI's live indicators.
    const sounding = [];
    for (const ev of events) {
      const voice = voices[ev.layerId];
      if (!voice) continue;
      // Pitched events need a synth voice; skip rather than crash on any
      // transient mismatch between the store's project and the voice graph.
      const pitched = ev.kind === "chord" || ev.kind === "scale";
      if (pitched && !voice.synth) continue;
      sounding.push(ev.layerId);
      const when = time + (ev.offset ?? 0);
      // Pluck voices have no velocity parameter; their serial velocity gain
      // (see voices.js) carries the note's expression instead.
      if (voice.velGain) voice.velGain.gain.setValueAtTime(voice.velGain.baseGain * ev.velocity, when);
      if (ev.kind === "chord") {
        voice.synth.triggerAttackRelease(chordNotes(score, ev.degree), ev.duration, when, ev.velocity);
      } else if (ev.kind === "scale") {
        voice.synth.triggerAttackRelease(
          midiToNote(scaleMidi(score, ev.degree, ev.octave)),
          ev.duration,
          when,
          ev.velocity,
        );
      } else if (ev.kind === "kick") {
        voice.kick.triggerAttackRelease(ev.pitch ?? "D1", ev.duration, when, ev.velocity);
      } else if (ev.kind === "hat") {
        // NoiseSynth signature is (duration, time, velocity).
        voice.hat.triggerAttackRelease(ev.duration ?? "32n", when, ev.velocity);
      } else if (ev.kind === "snare") {
        const target = voice.snare ?? voice.hat;
        target.triggerAttackRelease(ev.duration ?? "16n", when, ev.velocity);
      }
    }

    // One-shot flourish (v5): a queued game milestone plays across this bar
    // via the lead voice, then resolves the context it narrates. All events
    // come from the shared catalog / per-song overrides in the project JSON.
    if (isBar) {
      const queued = store.get().flourishQueued;
      if (queued && FLOURISH_NAMES.includes(queued)) {
        const lead = firstVoiceOf("melody") ?? firstVoiceOf("chords");
        if (lead?.synth) {
          const spb = 60 / score.bpm;
          for (const ev of flourishEvents(score, queued)) {
            lead.synth.triggerAttackRelease(
              midiToNote(scaleMidi(score, ev.degree, ev.octave)),
              ev.dur * spb,
              time + ev.at * spb,
              ev.vel,
            );
          }
        }
        // The flourish resolves what it dramatizes: victory/defeat/calm settle
        // back to exploration, combat commits to combat, unease lingers tense.
        const resolve = { victory: "explore", defeat: "explore", calm: "explore", relief: "explore", combat: "combat", unease: "unease" }[queued];
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
