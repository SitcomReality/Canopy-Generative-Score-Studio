// Web Audio graph + 16-step sequencer, built on the vendored Tone global.
// The transport callback reads live values from the passed-in `store`, so
// parameter changes apply without re-subscribing. Every project layer gets
// its own voice(s), shaped by its role. Adaptive context changes are only
// applied on bar boundaries (steps 0 and 8).
import { midiToNote } from "../music/note-names.js";
import { scaleMidi, chordNotes } from "../music/scale-math.js";

const INSTRUMENT_SETTINGS = {
  "Glass bell": { oscillator: { type: "sine" }, envelope: { attack: 0.04, decay: 0.3, sustain: 0.22, release: 2.8 } },
  "Warm reed": { oscillator: { type: "square8" }, envelope: { attack: 0.12, decay: 0.22, sustain: 0.3, release: 1.8 } },
  "Soft pluck": { oscillator: { type: "triangle" }, envelope: { attack: 0.008, decay: 0.45, sustain: 0.08, release: 1.4 } },
};

function instrumentSettings(voice) {
  return INSTRUMENT_SETTINGS[voice] ?? INSTRUMENT_SETTINGS["Glass bell"];
}

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
  for (const layer of project.layers) {
    if (layer.role === "harmony") {
      const synth = new Tone.PolySynth(Tone.Synth).set({
        oscillator: { type: "triangle8" },
        envelope: { attack: 1.3, decay: 1.5, sustain: 0.5, release: 4.5 },
        volume: -16,
      }).connect(reverb);
      voices[layer.id] = { kind: "chords", synth };
      disposables.push(synth);
    } else if (layer.role === "motif") {
      const synth = new Tone.PolySynth(Tone.Synth).set({
        ...instrumentSettings(layer.instrument),
        volume: -9,
      }).connect(delay);
      voices[layer.id] = { kind: "melody", synth };
      disposables.push(synth);
    } else if (layer.role === "bass") {
      const synth = new Tone.MonoSynth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.03, decay: 0.25, sustain: 0.28, release: 0.7 },
        filterEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.4, baseFrequency: 80, octaves: 2.8 },
        volume: -11,
      }).connect(limiter);
      voices[layer.id] = { kind: "bass", synth };
      disposables.push(synth);
    } else if (layer.role === "percussion") {
      const kick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.2 },
        volume: -10,
      }).connect(limiter);
      const hat = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
        volume: -24,
      }).connect(reverb);
      voices[layer.id] = { kind: "drums", kick, hat };
      disposables.push(kick, hat);
    }
  }

  const firstVoiceOf = (kind) => project.layers.map((layer) => voices[layer.id]).find((voice) => voice.kind === kind);

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
      transport.bpm.rampTo(score.bpm + ({ explore: 0, unease: 8, combat: 22 })[context], 0.6);
    }

    const contextDensity = context === "combat" ? 0.98 : context === "unease" ? 0.76 : 0.5;
    const chordDegree = score.progression[Math.floor(step / 4) % score.progression.length];

    for (const layer of score.layers) {
      const voice = voices[layer.id];
      if (!voice || layer.muted) continue;
      const humanDelay = Math.random() * (layer.humanize / 100) * 0.035;

      if (voice.kind === "chords") {
        if (layer.steps[step]) {
          voice.synth.triggerAttackRelease(
            chordNotes(score, chordDegree),
            context === "combat" ? "2n" : "1m",
            time,
            context === "combat" ? 0.3 : 0.22,
          );
        }
      } else if (voice.kind === "melody") {
        let degree = layer.steps[step];
        if (degree !== null && Math.random() < 0.12 * (layer.variation / 100)) {
          degree = Math.max(0, Math.min(7, degree + (Math.random() > 0.5 ? 1 : -1)));
        }
        if (degree === null && Math.random() < 0.08 * (layer.variation / 100) * contextDensity) {
          degree = Math.max(0, Math.min(7, chordDegree + (Math.random() > 0.5 ? 2 : 4)));
        }
        if (degree !== null && Math.random() < layer.density / 100 + 0.24) {
          const octave = context === "combat" && step % 4 === 3 ? 5 : 4;
          const velocity = context === "combat" ? 0.58 : context === "unease" ? 0.48 : 0.4;
          voice.synth.triggerAttackRelease(
            midiToNote(scaleMidi(score, degree, octave)),
            context === "explore" ? "4n" : "8n",
            time + humanDelay,
            velocity,
          );
        }
      } else if (voice.kind === "bass") {
        const active = layer.steps[step] || (context === "unease" && step % 4 === 2) || (context === "combat" && step % 2 === 0);
        if (active) {
          voice.synth.triggerAttackRelease(
            midiToNote(scaleMidi(score, chordDegree, 2)),
            context === "combat" ? "8n" : "4n",
            time + humanDelay * 0.45,
            context === "combat" ? 0.56 : 0.32,
          );
        }
      } else if (voice.kind === "drums") {
        const active = layer.steps[step] || (context === "combat" && step % 2 === 0);
        if (active) {
          if (step % 4 === 0 || context === "combat") {
            voice.kick.triggerAttackRelease(context === "combat" ? "C1" : "D1", "16n", time, context === "combat" ? 0.68 : 0.25);
          }
          if (context !== "explore" || Math.random() < (layer.variation / 100) * 0.3) {
            voice.hat.triggerAttackRelease("32n", time + humanDelay * 0.7, context === "combat" ? 0.32 : 0.16);
          }
        }
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
      transport.bpm.rampTo(score.bpm, 0.6);
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
      const offset = ({ combat: 22, unease: 8, explore: 0 })[store.get().currentContext] ?? 0;
      transport.bpm.rampTo(bpm + offset, 0.6);
    },
    setInstrument(layerId, voice) {
      const target = voices[layerId];
      if (target?.kind === "melody" || target?.kind === "chords") {
        target.synth.set(instrumentSettings(voice));
      }
    },
    play() {
      transport.start("+0.05");
    },
    pause() {
      transport.pause();
    },
    stop() {
      transport.stop();
      transport.position = 0;
      store.set({ step: 0 });
    },
    dispose() {
      transport.clear(loopId);
      disposables.forEach((node) => node.dispose());
    },
  };
}
