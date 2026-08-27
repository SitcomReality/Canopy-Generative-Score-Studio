// The percussion piece catalog (schema v8): the kit a beat layer's per-step
// hits reference. A hit list step is `[{ piece, at, vel?, pitch? }]` where
// `piece` keys into this catalog.
//
// Every piece carries its authored defaults so the shared dynamics core can
// resolve a hit without the user spelling out every field:
//   vel    — default hit velocity (0..1); a hit's own `vel` overrides it.
//   dur    — default duration (Tone time string); the realized decay.
//   sound  — which synth family builds it (mirrors the voice-builder mapping):
//            "membrane" (MembraneSynth, fixed/swept pitch), "drum"
//            (pitchable MembraneSynth), "tone" (pitched metallic/tuned synth),
//            "noise" (NoiseSynth, unpitched).
//   degree — default scale degree (0..7) for pitched pieces, keeping them in
//            the song's key/scale (harmony guard). A hit's `pitch` overrides.
//   octave — default octave the pitched piece sounds in.
//
// This module is PURE data and is spliced into the exported .score.js alongside
// the reactive-dynamics core (see dev/scripts/vendor_dynamics.mjs), so it must
// stay Tone/DOM-free. It is also re-exported from the dynamics barrel.
export const PIECES = {
  kick: { label: "Kick", sound: "membrane", vel: 0.9, dur: "16n" },
  rim: { label: "Rim", sound: "tone", vel: 0.55, dur: "16n", degree: 0, octave: 6 },
  hat: { label: "Hat", sound: "noise", vel: 0.35, dur: "32n" },
  "hat-open": { label: "Hat open", sound: "noise", vel: 0.4, dur: "8n" },
  snare: { label: "Snare", sound: "noise", vel: 0.6, dur: "16n" },
  "tom-hi": { label: "Tom hi", sound: "drum", vel: 0.5, dur: "16n", degree: 5, octave: 4 },
  "tom-lo": { label: "Tom lo", sound: "drum", vel: 0.5, dur: "16n", degree: 2, octave: 4 },
  "bongo-hi": { label: "Bongo hi", sound: "drum", vel: 0.5, dur: "16n", degree: 4, octave: 5 },
  "bongo-lo": { label: "Bongo lo", sound: "drum", vel: 0.5, dur: "16n", degree: 2, octave: 5 },
  keyed: { label: "Keyed", sound: "tone", vel: 0.6, dur: "16n", degree: 0, octave: 6 },
  steel: { label: "Steel", sound: "tone", vel: 0.6, dur: "16n", degree: 2, octave: 6 },
  shaker: { label: "Shaker", sound: "noise", vel: 0.3, dur: "32n" },
};

export const PIECE_NAMES = Object.keys(PIECES);

// The catalog lookup the dynamics core uses for resume. Returns undefined for
// unknown pieces so a malformed hit degrades to silence rather than a crash.
export function pieceInfo(piece) {
  return PIECES[piece];
}

// A pitched piece carries a scale degree (0..7) that the engine maps through
// the song's scale so toms/bongos/rim/keyed/steel stay in key.
export function pieceIsPitched(piece) {
  const info = PIECES[piece];
  return info?.sound === "drum" || info?.sound === "tone";
}
