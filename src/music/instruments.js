// Instrument catalog: the single source of truth for the presets offered in
// the UI and for the synth settings the audio engine applies per role. Every
// preset carries a config for all four layer roles, so any role + instrument
// combination is audible. Pure data — no DOM, no audio, no imports.
//
// motif / harmony configs feed Tone.PolySynth(Tone.Synth).set(...), bass
// feeds Tone.MonoSynth (a filterEnvelope is included so the low end keeps
// its shape), percussion feeds a MembraneSynth kick + NoiseSynth hat pair.

export const INSTRUMENTS = {
  "Glass bell": {
    motif: { oscillator: { type: "sine" }, envelope: { attack: 0.04, decay: 0.3, sustain: 0.22, release: 2.8 } },
    harmony: { oscillator: { type: "sine" }, envelope: { attack: 1.3, decay: 1.5, sustain: 0.5, release: 4.5 } },
    bass: {
      oscillator: { type: "sine" },
      envelope: { attack: 0.03, decay: 0.3, sustain: 0.24, release: 0.8 },
      filterEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.4, baseFrequency: 90, octaves: 2.6 },
    },
    percussion: {
      kick: { pitchDecay: 0.05, octaves: 6, envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.2 } },
      hat: { noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } },
    },
  },
  "Warm reed": {
    motif: { oscillator: { type: "square8" }, envelope: { attack: 0.12, decay: 0.22, sustain: 0.3, release: 1.8 } },
    harmony: { oscillator: { type: "square8" }, envelope: { attack: 0.9, decay: 1.2, sustain: 0.45, release: 3.2 } },
    bass: {
      oscillator: { type: "square8" },
      envelope: { attack: 0.05, decay: 0.25, sustain: 0.26, release: 0.7 },
      filterEnvelope: { attack: 0.03, decay: 0.28, sustain: 0.18, release: 0.4, baseFrequency: 80, octaves: 2.8 },
    },
    percussion: {
      kick: { pitchDecay: 0.04, octaves: 5, envelope: { attack: 0.002, decay: 0.26, sustain: 0, release: 0.15 } },
      hat: { noise: { type: "brown" }, envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.03 } },
    },
  },
  "Soft pluck": {
    motif: { oscillator: { type: "triangle" }, envelope: { attack: 0.008, decay: 0.45, sustain: 0.08, release: 1.4 } },
    harmony: { oscillator: { type: "triangle8" }, envelope: { attack: 0.6, decay: 1.0, sustain: 0.35, release: 2.6 } },
    bass: {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.008, decay: 0.4, sustain: 0.12, release: 0.6 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.14, release: 0.4, baseFrequency: 100, octaves: 2.4 },
    },
    percussion: {
      kick: { pitchDecay: 0.03, octaves: 7, envelope: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.12 } },
      hat: { noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 } },
    },
  },
  "Velvet pad": {
    motif: { oscillator: { type: "sawtooth" }, envelope: { attack: 0.5, decay: 0.6, sustain: 0.4, release: 3.4 } },
    harmony: { oscillator: { type: "sawtooth" }, envelope: { attack: 1.8, decay: 1.4, sustain: 0.55, release: 5.2 } },
    bass: {
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.25, decay: 0.3, sustain: 0.3, release: 1.0 },
      filterEnvelope: { attack: 0.2, decay: 0.35, sustain: 0.22, release: 0.6, baseFrequency: 70, octaves: 2.2 },
    },
    percussion: {
      kick: { pitchDecay: 0.09, octaves: 4, envelope: { attack: 0.004, decay: 0.45, sustain: 0, release: 0.3 } },
      hat: { noise: { type: "pink" }, envelope: { attack: 0.01, decay: 0.18, sustain: 0, release: 0.08 } },
    },
  },
  "Hollow mallet": {
    motif: { oscillator: { type: "triangle" }, envelope: { attack: 0.002, decay: 0.6, sustain: 0.02, release: 1.9 } },
    harmony: { oscillator: { type: "triangle8" }, envelope: { attack: 0.4, decay: 0.9, sustain: 0.18, release: 2.4 } },
    bass: {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.004, decay: 0.5, sustain: 0.06, release: 0.7 },
      filterEnvelope: { attack: 0.01, decay: 0.4, sustain: 0.1, release: 0.4, baseFrequency: 110, octaves: 2.0 },
    },
    percussion: {
      kick: { pitchDecay: 0.02, octaves: 8, envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.1 } },
      hat: { noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.11, sustain: 0, release: 0.04 } },
    },
  },
  "Deep root": {
    motif: { oscillator: { type: "sine" }, envelope: { attack: 0.06, decay: 0.4, sustain: 0.3, release: 2.2 } },
    harmony: { oscillator: { type: "sine" }, envelope: { attack: 1.5, decay: 1.6, sustain: 0.5, release: 4.8 } },
    bass: {
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.35, sustain: 0.34, release: 0.9 },
      filterEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.24, release: 0.5, baseFrequency: 60, octaves: 2.4 },
    },
    percussion: {
      kick: { pitchDecay: 0.07, octaves: 6, envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.24 } },
      hat: { noise: { type: "brown" }, envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.03 } },
    },
  },
};

export const INSTRUMENT_NAMES = Object.keys(INSTRUMENTS);

// Settings for a role, falling back to Glass bell for unknown names (same
// defensive default the engine used before the catalog existed).
export function instrumentSettings(instrument, role) {
  const preset = INSTRUMENTS[instrument] ?? INSTRUMENTS["Glass bell"];
  return preset[role];
}
