// Emitted-source part: the harmony guard for the standalone runtime — a flat
// mirror of scale-math.js. The song's key/scale live on the emitted `score`
// object; nothing generated can leave them.
export function theorySrc(scalesJson) {
  return `const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = ${scalesJson};
function pitchClass(key) {
  return NOTES.indexOf(({ Eb: "D#", Ab: "G#", Bb: "A#" })[key] || key);
}
function note(degree, octave = 4) {
  const scale = SCALES[score.scale];
  const wrapped = ((degree % scale.length) + scale.length) % scale.length;
  const midi = 12 * (octave + 1 + Math.floor(degree / scale.length)) + pitchClass(score.key) + scale[wrapped];
  return NOTES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}
function chord(degree) {
  return [degree, degree + 2, degree + 4, degree + 6].map((d) => note(d, 3));
}`;
}
