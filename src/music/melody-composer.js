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

// Generate a hit-list pattern for a hits-kind layer, shaped by its role.
// Harmony and bass anchor on the bar starts; percussion gets a livelier
// skeleton. Density (the layer's own) drives how busy the result is. Hits are
// on-beat (at 0) by default; percussion gets a kick, harmony/bass a plain hit.
export function composePattern(layer) {
  const density = (layer.density ?? 50) / 100;
  const perc = layer.role === "percussion" || layer.role === "drums";
  return Array.from({ length: 16 }, (_, step) => {
    let on = false;
    if (layer.role === "harmony") on = step % 4 === 0 || Math.random() < 0.12 * density;
    else if (layer.role === "bass") on = step % 4 === 0 || Math.random() < 0.25 * density;
    else on = step % 4 === 0 ? Math.random() < 0.9 : Math.random() < 0.45 * density;
    if (!on) return [];
    return perc ? [{ piece: "kick", at: 0 }] : [{ at: 0 }];
  });
}
