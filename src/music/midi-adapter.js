// MIDI export/import via the vendored @tonejs/midi global (window.Midi).
import { SCALES } from "./scales.js";
import { keyToPitchClass, midiToNote } from "./note-names.js";
import { scaleMidi, chordNotes } from "./scale-math.js";
import { LAYER_ROLES } from "./default-project.js";

export function buildMidi(project) {
  const midi = new Midi();
  midi.header.name = project.name;
  midi.header.setTempo(project.bpm);
  const motif = project.layers.find((layer) => LAYER_ROLES[layer.role].kind === "degrees");
  const melodyTrack = midi.addTrack();
  melodyTrack.name = "Canopy Melody";
  const chordTrack = midi.addTrack();
  chordTrack.name = "Canopy Chords";
  const eighth = 60 / project.bpm / 2;
  if (motif) {
    motif.steps.forEach((degree, step) => {
      if (degree !== null) melodyTrack.addNote({ name: midiToNote(scaleMidi(project, degree, 4)), time: step * eighth, duration: eighth * 0.82, velocity: 0.7 });
    });
  }
  project.progression.forEach((degree, index) => {
    chordNotes(project, degree).forEach((name) => chordTrack.addNote({ name, time: index * eighth * 4, duration: eighth * 3.8, velocity: 0.45 }));
  });
  return new Uint8Array(midi.toArray());
}

// Fits the densest track of a MIDI file into a 16-step melody of scale
// degrees for the project's current key/scale.
export function melodyFromMidi(midi, project) {
  const source = [...midi.tracks].sort((a, b) => b.notes.length - a.notes.length)[0];
  if (!source || source.notes.length === 0) throw new Error("No MIDI notes found");
  const bpm = Math.round(midi.header.tempos[0]?.bpm ?? project.bpm);
  const eighth = 60 / bpm / 2;
  const melody = Array(16).fill(null);
  const scale = SCALES[project.scale];
  const root = keyToPitchClass(project.key);
  source.notes.forEach((note) => {
    const step = Math.round(note.time / eighth) % 16;
    const relative = ((note.midi - root) % 12 + 12) % 12;
    let degree = 0;
    let closest = 99;
    scale.forEach((interval, index) => {
      const distance = Math.abs(interval - relative);
      if (distance < closest) {
        degree = index + (note.octave > 4 ? scale.length : 0);
        closest = distance;
      }
    });
    melody[step] = Math.min(7, degree);
  });
  return { bpm, name: midi.name || "", melody };
}
