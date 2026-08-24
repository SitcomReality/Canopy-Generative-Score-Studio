// Named scales as semitone interval sets from the root. Every generated note
// must pass through these (the "harmony guard").
export const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Pentatonic: [0, 2, 4, 7, 9],
};
