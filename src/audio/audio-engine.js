// Web Audio graph + 16-step sequencer, built on the vendored Tone global.
// The transport callback reads live values from the passed-in `store`, so
// parameter changes apply without re-subscribing. Every project layer gets
// its own voice(s), shaped by its role. Adaptive *decisions* (activity,
// automation, fills, context -> axis -> parameter) come from the shared pure
// core in ../music/dynamics.js, never from hardcoded context rules here.
import { midiToNote } from "../music/note-names.js";
import { scaleMidi, chordNotes } from "../music/scale-math.js";
import { instrumentSettings } from "../music/instruments.js";
import { mutateMotif, makeRng } from "../music/variation.js";
import {
  computeStepFrame,
  contextTargets,
  easeToward,
  tempoOffset,
  journeyGain,
  layerActive,
} from "../music/dynamics.js";
import { journeyEnergy } from "../music/variation.js";

export function createAudioEngine(store) {
  const project = store.get().project;

  const master = new Tone.Gain(0.74).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: project.reverb / 100 }).connect(limiter);
  const delay = new Tone.FeedbackDelay("8n.", 0.22).connect(reverb);
  delay.wet.value = 0.26;

  // One voice bundle per layer, keyed by layer id. Layers added later (see
  // layer management) rebuild the engine, so this map always mirrors the
  // project's layers at construction time.
  const voices = {};
  const disposables = [delay, reverb, limiter, master];
  const makeDrums = (instrument) => {
    const preset = instrumentSettings(instrument, "percussion");
    const kick = new Tone.MembraneSynth({ ...preset.kick, volume: -10 }).connect(limiter);
    const hat = new Tone.NoiseSynth({ ...preset.hat, volume: -24 }).connect(reverb);
    disposables.push(kick, hat);
    return { kind: "drums", kick, hat };
  };
  for (const layer of project.layers) {
    if (layer.role === "harmony") {
      const synth = new Tone.PolySynth(Tone.Synth).set({
        ...instrumentSettings(layer.instrument, "harmony"),
        volume: -16,
      }).connect(reverb);
      voices[layer.id] = { kind: "chords", synth };
      disposables.push(synth);
    } else if (layer.role === "motif") {
      const synth = new Tone.PolySynth(Tone.Synth).set({
        ...instrumentSettings(layer.instrument, "motif"),
        volume: -9,
      }).connect(delay);
      voices[layer.id] = { kind: "melody", synth };
      disposables.push(synth);
    } else if (layer.role === "bass") {
      const synth = new Tone.MonoSynth({
        ...instrumentSettings(layer.instrument, "bass"),
        volume: -11,
      }).connect(limiter);
      voices[layer.id] = { kind: "bass", synth };
      disposables.push(synth);
    } else if (layer.role === "percussion") {
      voices[layer.id] = makeDrums(layer.instrument);
    }
  }

  const firstVoiceOf = (kind) => project.layers.map((layer) => voices[layer.id]).find((voice) => voice.kind === kind);

  // Performance copies of motif phrases. The written phrase in the project
  // is never modified; at each bar boundary motif layers get a fresh drift
  // pass derived from it, scaled by their "Safe variation" slider.
  const perfSteps = {};
  for (const layer of project.layers) {
    if ((voices[layer.id]?.kind ?? layer.role) === "melody") perfSteps[layer.id] = [...layer.steps];
  }

  // Long-form arrangement state: absolute bar count for the journey curve,
  // per-layer pass counters for rest windows, and the current quiet-pass
  // flags consulted by the step callback.
  let barCount = 0;
  const restCounter = {};
  const resting = {};
  // The live axis vector, eased toward the active context's targets each bar.
  let liveAxes = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
  // Seeded determinism: a non-zero variationSeed reproduces the same drift
  // sequence; 0 (the default) is fully random. Reset on each playback.
  let driftRng = Math.random;

  const transport = Tone.getTransport();
  transport.bpm.value = project.bpm;
  transport.swing = project.swing / 100;
  transport.swingSubdivision = "8n";

  const loopId = transport.scheduleRepeat((time) => onStep(time), "8n");

  function onStep(time) {
    const score = store.get().project;
    let context = store.get().currentContext;
    const step = store.get().step;
    const isBar = step === 0 || step === 8;
    const queuedContext = store.get().queuedContext;

    if (isBar && queuedContext) {
      context = queuedContext;
      store.set({ currentContext: context, queuedContext: null });
    }

    // Ease live axes toward the active context's targets every bar boundary.
    if (isBar) {
      liveAxes = easeToward(liveAxes, contextTargets(score, context), 0.5);
      transport.bpm.rampTo(score.bpm + tempoOffset(score, liveAxes), 0.6);
    }

    // Bar-boundary phrase drift for motif layers (long-form variation).
    if (isBar) {
      for (const layer of score.layers) {
        if (layer.role === "motif" && !layer.muted && layer.variation > 0) {
          perfSteps[layer.id] = mutateMotif(layer.steps, layer.variation, driftRng);
        }
      }
    }

    // Macro journey + arrangement energy, applied once per bar.
    if (step === 0) {
      barCount += 1;
      const journey = score.journey ?? { shape: "flat", length: 16, depth: 0 };
      const energy = journeyEnergy(journey.shape, journey.depth, barCount, journey.length);
      for (const layer of score.layers) {
        restCounter[layer.id] = (restCounter[layer.id] ?? 0) + 1;
        const window = layer.restWindow ?? 0;
        resting[layer.id] = window > 0 && restCounter[layer.id] % (window + 1) === 0;
        const voice = voices[layer.id];
        if (!voice || layer.muted || resting[layer.id] || !layerActive(layer, liveAxes)) continue;
        const delta = journeyGain(layer, energy);
        if (voice.kind === "drums") {
          voice.kick.volume.rampTo(-10 + delta, 0.8);
          voice.hat.volume.rampTo(-24 + delta, 0.8);
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
    const events = computeStepFrame(score, liveAxes, { features, resting: restingIds }, step, driftRng);

    for (const ev of events) {
      const voice = voices[ev.layerId];
      if (!voice) continue;
      if (ev.kind === "chord") {
        voice.synth.triggerAttackRelease(chordNotes(score, ev.degree), ev.duration, time + (ev.offset ?? 0), ev.velocity);
      } else if (ev.kind === "scale") {
        voice.synth.triggerAttackRelease(
          midiToNote(scaleMidi(score, ev.degree, ev.octave)),
          ev.duration,
          time + (ev.offset ?? 0),
          ev.velocity,
        );
      } else if (ev.kind === "kick") {
        voice.kick.triggerAttackRelease(ev.pitch ?? "D1", ev.duration, time + (ev.offset ?? 0), ev.velocity);
      } else if (ev.kind === "hat") {
        voice.hat.triggerAttackRelease("32n", ev.duration, time + (ev.offset ?? 0), ev.velocity);
      }
    }

    if (isBar && store.get().victoryQueued) {
      const flourish = firstVoiceOf("melody") ?? firstVoiceOf("chords");
      if (flourish) {
        [0, 2, 4, 7].forEach((degree, index) => {
          flourish.synth.triggerAttackRelease(midiToNote(scaleMidi(score, degree, 5)), "16n", time + index * 0.09, 0.68);
        });
      }
      // Triumph resolves: the music settles back into unthreatened
      // exploration from this same bar boundary.
      store.set({ victoryQueued: false, currentContext: "explore", queuedContext: null });
      liveAxes = easeToward(liveAxes, contextTargets(score, "explore"), 1);
      transport.bpm.rampTo(score.bpm + tempoOffset(score, liveAxes), 0.6);
    }

    store.set({ step: (step + 1) % 16 });
  }

  return {
    setReverb(value) {
      reverb.wet.rampTo(value / 100, 0.2);
    },
    setSwing(value) {
      transport.swing = value / 100;
    },
    setTempo(bpm) {
      const offset = tempoOffset(store.get().project, liveAxes);
      transport.bpm.rampTo(bpm + offset, 0.6);
    },
    setInstrument(layerId, instrument) {
      const target = voices[layerId];
      if (!target) return;
      if (target.kind === "melody" || target.kind === "chords") {
        const role = target.kind === "chords" ? "harmony" : "motif";
        target.synth.set(instrumentSettings(instrument, role));
      } else if (target.kind === "bass") {
        target.synth.set(instrumentSettings(instrument, "bass"));
      } else if (target.kind === "drums") {
        // Swap the kick/hat pair live; dispose the old nodes afterwards.
        const old = [target.kick, target.hat];
        const next = makeDrums(instrument);
        voices[layerId] = next;
        old.forEach((node) => node.dispose());
      }
    },
    play() {
      driftRng = makeRng(store.get().project.variationSeed ?? 0);
      transport.start("+0.05");
    },
    pause() {
      transport.pause();
    },
    stop() {
      transport.stop();
      transport.position = 0;
      // Discard drifted phrases so the next playback starts from the score
      // as written.
      barCount = 0;
      driftRng = Math.random;
      Object.keys(restCounter).forEach((id) => delete restCounter[id]);
      Object.keys(resting).forEach((id) => delete resting[id]);
      for (const layer of store.get().project.layers) {
        if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
      }
      store.set({ step: 0 });
    },
    dispose() {
      transport.clear(loopId);
      disposables.forEach((node) => node.dispose());
    },
  };
}
