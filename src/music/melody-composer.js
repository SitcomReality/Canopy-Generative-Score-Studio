// Generative motif helpers. Both are pure: they take a project and return a
// new 16-step melody array; every degree stays inside the scale because they
// only ever move within 0..7 around chord degrees (harmony guard).
import { SCALES } from "./scales.js";

export function composeMelody(project, layer) {
  const density = layer?.density ?? 58;
  const scaleLength = SCALES[project.scale].length;
  let cursor = Math.min(4, scaleLength - 1);
  const melody = Array.from({ length: 16 }, (_, index) => {
    const chord = project.progression[Math.floor(index / 4)];
    if (index % 4 === 0) {
      cursor = Math.min(7, chord + (Math.random() > 0.55 ? 2 : 4));
      return cursor;
    }
    if (Math.random() > density / 100) return null;
    const movement = Math.random() < 0.7 ? (Math.random() > 0.5 ? 1 : -1) : Math.random() > 0.5 ? 2 : -2;
    cursor = Math.max(0, Math.min(7, cursor + movement));
    return cursor;
  });
  melody[15] = 0;
  return melody;
}

export function makeSparser(melody) {
  return melody.map((note, index) => (index % 4 !== 0 && Math.random() < 0.38 ? null : note));
}
