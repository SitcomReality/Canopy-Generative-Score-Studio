// Tests for the harmony guard: scaleMidi/chordNotes must only ever emit
// notes inside the chosen key/scale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleMidi, chordNotes, chordLabel } from "../../src/music/scale-math.js";
import { SCALES } from "../../src/music/scales.js";
import { KEYS } from "../../src/music/keys.js";
import { keyToPitchClass, midiToNote } from "../../src/music/note-names.js";
import { NOTE_NAMES } from "../../src/music/note-names.js";
import { PROGRESSIONS } from "../../src/music/progressions.js";

const PROJECTS = KEYS.flatMap((key) =>
  Object.keys(SCALES).map((scale) => ({ key, scale })),
);

function noteToMidi(name) {
  const match = name.match(/^([A-G]#?)(\d)$/);
  assert.ok(match, `unparseable note name ${name}`);
  return 12 * (Number(match[2]) + 1) + NOTE_NAMES.indexOf(match[1]);
}

test("scaleMidi stays inside the scale for every key, scale and degree", () => {
  for (const project of PROJECTS) {
    const scale = SCALES[project.scale];
    for (let degree = -14; degree <= 28; degree += 1) {
      const midi = scaleMidi(project, degree, 4);
      const offset = (((midi - keyToPitchClass(project.key)) % 12) + 12) % 12;
      assert.ok(
        scale.includes(offset),
        `${project.key} ${project.scale} degree ${degree} -> midi ${midi} (offset ${offset})`,
      );
    }
  }
});

test("scaleMidi wraps negative degrees into the scale", () => {
  const project = { key: "D", scale: "Lydian" };
  assert.equal(scaleMidi(project, -7), scaleMidi(project, 0) - 12);
  assert.equal(scaleMidi(project, -1), scaleMidi(project, 6) - 12);
});

test("scaleMidi octave parameter shifts by octaves", () => {
  const project = { key: "D", scale: "Lydian" };
  assert.equal(scaleMidi(project, 0, 3) + 12, scaleMidi(project, 0, 4));
  assert.equal(scaleMidi(project, 7, 4), scaleMidi(project, 0, 4) + 12);
});

test("chordNotes are four named notes, all inside the scale", () => {
  for (const project of PROJECTS) {
    const scale = SCALES[project.scale];
    for (let degree = 0; degree < 7; degree += 1) {
      const notes = chordNotes(project, degree);
      assert.equal(notes.length, 4);
      for (const note of notes) {
        const midi = noteToMidi(note);
        const offset = (((midi - keyToPitchClass(project.key)) % 12) + 12) % 12;
        assert.ok(scale.includes(offset), `${project.key}/${project.scale} deg ${degree}: ${note}`);
      }
    }
  }
});

test("chordNotes stack ascending scale thirds", () => {
  const project = { key: "D", scale: "Lydian" };
  const midis = chordNotes(project, 0).map(noteToMidi);
  for (let i = 1; i < midis.length; i += 1) {
    const interval = midis[i] - midis[i - 1];
    assert.ok(interval === 3 || interval === 4, `interval ${interval}`);
  }
});

test("chordNotes and scaleMidi agree on the chord root", () => {
  const project = { key: "D", scale: "Lydian" };
  assert.equal(chordNotes(project, 2)[0], midiToNote(scaleMidi(project, 2, 3)));
});

test("chordLabel starts with the chord root and ends with a quality", () => {
  const project = { key: "D", scale: "Lydian" };
  for (const { degrees } of PROGRESSIONS) {
    for (const degree of degrees) {
      assert.match(chordLabel(project, degree), /^[A-G]#?(m7|add9|maj7)$/);
    }
  }
});

test("chordLabel uses m7 for minor scales on the tonic", () => {
  assert.match(chordLabel({ key: "D", scale: "Minor" }, 0), /m7$/);
  assert.match(chordLabel({ key: "D", scale: "Dorian" }, 0), /m7$/);
  assert.match(chordLabel({ key: "D", scale: "Lydian" }, 0), /maj7$/);
});
