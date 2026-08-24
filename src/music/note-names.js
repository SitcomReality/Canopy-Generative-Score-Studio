// Chromatic note naming and pitch-class conversion.
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// UI key spellings that are flats; resolve them to their sharp equivalents.
const FLAT_TO_SHARP = { Eb: "D#", Ab: "G#", Bb: "A#" };

export function keyToPitchClass(key) {
  return NOTE_NAMES.indexOf(FLAT_TO_SHARP[key] ?? key);
}

export function midiToNote(midi) {
  const rounded = Math.round(midi);
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}
