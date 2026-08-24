// Web Audio graph + 16-step sequencer, built on the vendored Tone global.
// The transport callback reads live values from the passed-in `store`, so
// parameter changes apply without re-subscribing. Adaptive context changes
// are only applied on bar boundaries (steps 0 and 8).
import { midiToNote } from "../music/note-names.js";
import { scaleMidi, chordNotes } from "../music/scale-math.js";

export function createAudioEngine(store, hooks) {
  const project = store.get().project;

  const master = new Tone.Gain(0.74).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: project.reverb / 100 }).connect(limiter);
  const delay = new Tone.FeedbackDelay("8n.", 0.22).connect(reverb);
  delay.wet.value = 0.26;

  const voice = project.instrument;
  const melody = new Tone.PolySynth(Tone.Synth).set({
    oscillator: { type: voice === "Warm reed" ? "square8" : voice === "Soft pluck" ? "triangle" : "sine" },
    envelope: voice === "Warm reed"
      ? { attack: 0.12, decay: 0.22, sustain: 0.3, release: 1.8 }
      : voice === "Soft pluck"
        ? { attack: 0.008, decay: 0.45, sustain: 0.08, release: 1.4 }
        : { attack: 0.04, decay: 0.3, sustain: 0.22, release: 2.8 },
    volume: -9,
  }).connect(delay);
  const chords = new Tone.PolySynth(Tone.Synth).set({
    oscillator: { type: "triangle8" },
    envelope: { attack: 1.3, decay: 1.5, sustain: 0.5, release: 4.5 },
    volume: -16,
  }).connect(reverb);
  const bass = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.03, decay: 0.25, sustain: 0.28, release: 0.7 },
    filterEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.4, baseFrequency: 80, octaves: 2.8 },
    volume: -11,
  }).connect(limiter);
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
    const variationChance = score.variation / 100;
    const chordDegree = score.progression[Math.floor(step / 4) % score.progression.length];
    const humanDelay = Math.random() * (score.humanize / 100) * 0.035;

    if (step % 4 === 0 && !score.muted.chords) {
      chords.triggerAttackRelease(chordNotes(score, chordDegree), context === "combat" ? "2n" : "1m", time, context === "combat" ? 0.3 : 0.22);
    }

    let melodyDegree = score.melody[step];
    if (melodyDegree !== null && Math.random() < 0.12 * variationChance) {
      melodyDegree = Math.max(0, Math.min(7, melodyDegree + (Math.random() > 0.5 ? 1 : -1)));
    }
    if (melodyDegree === null && Math.random() < 0.08 * variationChance * contextDensity) {
      melodyDegree = Math.max(0, Math.min(7, chordDegree + (Math.random() > 0.5 ? 2 : 4)));
    }
    if (melodyDegree !== null && !score.muted.melody && Math.random() < score.density / 100 + 0.24) {
      const octave = context === "combat" && step % 4 === 3 ? 5 : 4;
      const velocity = context === "combat" ? 0.58 : context === "unease" ? 0.48 : 0.4;
      melody.triggerAttackRelease(midiToNote(scaleMidi(score, melodyDegree, octave)), context === "explore" ? "4n" : "8n", time + humanDelay, velocity);
    }

    const bassActive = score.bass[step] || (context === "unease" && step % 4 === 2) || (context === "combat" && step % 2 === 0);
    if (bassActive && !score.muted.bass) {
      bass.triggerAttackRelease(midiToNote(scaleMidi(score, chordDegree, 2)), context === "combat" ? "8n" : "4n", time + humanDelay * 0.45, context === "combat" ? 0.56 : 0.32);
    }

    const rhythmActive = score.percussion[step] || (context === "combat" && step % 2 === 0);
    if (rhythmActive && !score.muted.percussion) {
      if (step % 4 === 0 || context === "combat") {
        kick.triggerAttackRelease(context === "combat" ? "C1" : "D1", "16n", time, context === "combat" ? 0.68 : 0.25);
      }
      if (context !== "explore" || Math.random() < variationChance * 0.3) {
        hat.triggerAttackRelease("32n", time + humanDelay * 0.7, context === "combat" ? 0.32 : 0.16);
      }
    }

    if (isBar && store.get().victoryQueued) {
      [0, 2, 4, 7].forEach((degree, index) => {
        melody.triggerAttackRelease(midiToNote(scaleMidi(score, degree, 5)), "16n", time + index * 0.09, 0.68);
      });
      store.set({ victoryQueued: false });
    }

    hooks.onStep(step);
    store.set({ step: (step + 1) % 16 });
  }

  return {
    melody,
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
    setInstrument(voice) {
      melody.set(
        voice === "Warm reed"
          ? { oscillator: { type: "square8" }, envelope: { attack: 0.12, decay: 0.22, sustain: 0.3, release: 1.8 } }
          : voice === "Soft pluck"
            ? { oscillator: { type: "triangle" }, envelope: { attack: 0.008, decay: 0.45, sustain: 0.08, release: 1.4 } }
            : { oscillator: { type: "sine" }, envelope: { attack: 0.04, decay: 0.3, sustain: 0.22, release: 2.8 } },
      );
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
      [melody, chords, bass, kick, hat, delay, reverb, limiter, master].forEach((node) => node.dispose());
    },
  };
}
