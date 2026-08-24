// Scale-degree arithmetic. Every note the app plays is produced here, which
// is what makes the harmony guard hold: nothing can leave the chosen
// key/scale because degrees are wrapped into the scale and offset from its root.
import { SCALES } from "./scales.js";
import { keyToPitchClass, midiToNote } from "./note-names.js";

export function scaleMidi(project, degree, octave = 4) {
  const scale = SCALES[project.scale];
  const wrapped = ((degree % scale.length) + scale.length) % scale.length;
  const octaveLift = Math.floor(degree / scale.length);
  return 12 * (octave + 1 + octaveLift) + keyToPitchClass(project.key) + scale[wrapped];
}

export function chordNotes(project, degree, octave = 3) {
  return [degree, degree + 2, degree + 4, degree + 6].map((item) => midiToNote(scaleMidi(project, item, octave)));
}

export function chordLabel(project, degree) {
  const root = midiToNote(scaleMidi(project, degree, 3)).replace(/[0-9]/g, "");
  const quality = project.scale === "Minor" || project.scale === "Dorian" ? (degree === 0 ? "m7" : "add9") : "maj7";
  return `${root}${quality}`;
}
