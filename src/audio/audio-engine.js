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
  orderEvents,
} from "../music/dynamics.js";
import { journeyEnergy } from "../music/variation.js";

export function createAudioEngine(store) {
  const project = store.get().project;

  const master = new Tone.Gain(0.74).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  // Gentle glue compression ahead of the limiter so stacked layers stop
  // squashing into a "kicked" sound; pitched voices get an air shelf and a
  // little stereo width.
  const glue = new Tone.Compressor({ threshold: -20, ratio: 2.4, attack: 0.01, release: 0.25 }).connect(limiter);
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: project.reverb / 100 }).connect(glue);
  const delay = new Tone.FeedbackDelay("8n.", 0.22).connect(reverb);
  delay.wet.value = 0.26;
  const toneShaper = new Tone.Filter({ type: "lowpass", frequency: 7800 }).connect(glue);
  const motifBus = new Tone.Panner(-0.18).connect(delay);
  const harmonyBus = new Tone.Panner(0.18).connect(toneShaper);

  // One voice bundle per layer, keyed by layer id. Layers added later (see
  // layer management) rebuild the engine, so this map always mirrors the
  // project's layers at construction time.
  const voices = {};
  const disposables = [delay, reverb, glue, limiter, master, toneShaper, motifBus, harmonyBus];

  // Build a pitched voice from a role config: a plain PolySynth(Tone.Synth)
  // unless the preset declares `voice: "fm"` (PolySynth(FMSynth)) or
  // `voice: "pluck"` (Karplus-strong PluckSynth).
  const ROLE_VOLUME = { melody: -9, chords: -16, bass: -11 };
  const makePitched = (roleKey, cfg) => {
    const { voice, pluck, ...options } = cfg;
    if (voice === "pluck") {
      const synth = new Tone.PluckSynth({ ...(pluck ?? {}), volume: ROLE_VOLUME[roleKey] });
      return synth;
    }
    if (voice === "fm") {
      return new Tone.PolySynth(Tone.FMSynth).set({ ...options, volume: ROLE_VOLUME[roleKey] });
    }
    return new Tone.PolySynth(Tone.Synth).set({ ...options, volume: ROLE_VOLUME[roleKey] });
  };

  const makeDrums = (instrument) => {
    const preset = instrumentSettings(instrument, "percussion");
    const extras = [];
    const kick = new Tone.MembraneSynth({ ...preset.kick, volume: -10 }).connect(limiter);
    const hatFilter = preset.hatFilter
      ? new Tone.Filter({ type: "highpass", frequency: preset.hatFilter }).connect(reverb)
      : null;
    const hat = new Tone.NoiseSynth({ ...preset.hat, volume: -24 }).connect(hatFilter ?? reverb);
    if (hatFilter) extras.push(hatFilter);
    let snare = null;
    if (preset.snare) {
      const snareFilter = preset.snareFilter
        ? new Tone.Filter({ type: "bandpass", frequency: preset.snareFilter, Q: 0.8 }).connect(glue)
        : null;
      snare = new Tone.NoiseSynth({ ...preset.snare, volume: -14 }).connect(snareFilter ?? glue);
      if (snareFilter) extras.push(snareFilter);
      disposables.push(snare);
    }
    disposables.push(kick, hat, ...extras);
    return { kind: "drums", kick, hat, snare, extras };
  };
  for (const layer of project.layers) {
    if (layer.role === "harmony") {
      const synth = makePitched("chords", instrumentSettings(layer.instrument, "harmony"));
      synth.connect(harmonyBus);
      voices[layer.id] = { kind: "chords", synth };
      disposables.push(synth);
    } else if (layer.role === "motif") {
      const synth = makePitched("melody", instrumentSettings(layer.instrument, "motif"));
      synth.connect(motifBus);
      voices[layer.id] = { kind: "melody", synth };
      disposables.push(synth);
    } else if (layer.role === "bass") {
      const cfg = instrumentSettings(layer.instrument, "bass");
      const synth = cfg.pluck ? makePitched("bass", cfg) : new Tone.MonoSynth({ ...cfg, volume: -11 });
      if (!cfg.pluck) synth.connect(limiter);
      else synth.toDestination();
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
        // NoiseSynth signature is (duration, time, velocity).
        voice.hat.triggerAttackRelease(ev.duration ?? "32n", time + (ev.offset ?? 0), ev.velocity);
      } else if (ev.kind === "snare") {
        const target = voice.snare ?? voice.hat;
        target.triggerAttackRelease(ev.duration ?? "16n", time + (ev.offset ?? 0), ev.velocity);
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

    // Publish the drifted phrases and live reactive state on bar boundaries so
    // the UI can overlay ghost notes, meter the axes, and place the journey
    // playhead ("Generated variation" legend).
    if (isBar) store.set({ perfSteps: { ...perfSteps }, liveAxes: { ...liveAxes }, bar: barCount });
    store.set({ step: (step + 1) % 16, sounding });
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
        // Strip preset-only keys the live synth class may not know.
        const { voice, pluck, ...options } = instrumentSettings(instrument, role);
        target.synth.set({ ...options, volume: target.kind === "chords" ? -16 : -9 });
      } else if (target.kind === "bass") {
        const { voice, pluck, ...options } = instrumentSettings(instrument, "bass");
        target.synth.set({ ...options, volume: -11 });
      } else if (target.kind === "drums") {
        // Swap the kit live; dispose the old nodes afterwards.
        const old = [target.kick, target.hat, ...(target.snare ? [target.snare] : []), ...(target.extras ?? [])];
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
      store.set({ step: 0, sounding: [], perfSteps: { ...perfSteps }, bar: 0 });
    },
    dispose() {
      transport.clear(loopId);
      disposables.forEach((node) => node.dispose());
    },
  };
}
