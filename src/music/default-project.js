// The serialized project schema (version 1). Keep this shape stable: exported
// .canopy.json files and saved localStorage drafts must keep round-tripping.
export const EMPTY_STEPS = Array.from({ length: 16 }, () => false);

export const DEFAULT_PROJECT = {
  version: 1,
  name: "Sunlit Reaches",
  bpm: 76,
  key: "D",
  scale: "Lydian",
  progression: [0, 3, 5, 4],
  progressionName: "Open sky",
  melody: [4, null, 6, 5, 4, 2, null, 1, 2, null, 4, 3, 2, 1, null, 0],
  bass: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  percussion: [true, false, false, true, true, false, true, false, true, false, false, true, true, false, true, false],
  density: 58,
  variation: 34,
  humanize: 18,
  reverb: 64,
  swing: 8,
  instrument: "Glass bell",
  muted: { chords: false, melody: false, bass: false, percussion: false },
};

// Defensive deserialization: fill any missing/malformed field from defaults.
// Bump Project version and extend this when the schema ever breaks shape.
export function hydrateProject(value) {
  return {
    ...DEFAULT_PROJECT,
    ...value,
    melody: Array.isArray(value.melody) ? [...value.melody.slice(0, 16), ...Array(16).fill(null)].slice(0, 16) : DEFAULT_PROJECT.melody,
    bass: Array.isArray(value.bass) ? [...value.bass.slice(0, 16), ...EMPTY_STEPS].slice(0, 16) : DEFAULT_PROJECT.bass,
    percussion: Array.isArray(value.percussion)
      ? [...value.percussion.slice(0, 16), ...EMPTY_STEPS].slice(0, 16)
      : DEFAULT_PROJECT.percussion,
    muted: { ...DEFAULT_PROJECT.muted, ...(value.muted ?? {}) },
  };
}
