// Tests for chromatic note naming and pitch-class conversion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTE_NAMES, keyToPitchClass, midiToNote } from "../../src/music/note-names.js";
import { KEYS } from "../../src/music/keys.js";

test("NOTE_NAMES has 12 chromatic entries", () => {
  assert.equal(NOTE_NAMES.length, 12);
});

test("every selectable key resolves to a valid pitch class", () => {
  for (const key of KEYS) {
    const pc = keyToPitchClass(key);
    assert.ok(pc >= 0 && pc <= 11, `${key} -> ${pc}`);
  }
});

test("flat spellings resolve to their sharp equivalents", () => {
  assert.equal(keyToPitchClass("Eb"), keyToPitchClass("D#"));
  assert.equal(keyToPitchClass("Ab"), keyToPitchClass("G#"));
  assert.equal(keyToPitchClass("Bb"), keyToPitchClass("A#"));
});

test("known pitch classes", () => {
  assert.equal(keyToPitchClass("C"), 0);
  assert.equal(keyToPitchClass("D"), 2);
  assert.equal(keyToPitchClass("B"), 11);
});

test("midiToNote names octaves correctly", () => {
  assert.equal(midiToNote(60), "C4");
  assert.equal(midiToNote(61), "C#4");
  assert.equal(midiToNote(69), "A4");
  assert.equal(midiToNote(21), "A0");
});

test("midiToNote rounds fractional midi", () => {
  assert.equal(midiToNote(60.4), "C4");
  assert.equal(midiToNote(60.6), "C#4");
});

test("midiToNote and keyToPitchClass agree modulo 12", () => {
  for (let midi = 24; midi < 96; midi += 1) {
    const name = midiToNote(midi);
    assert.equal(NOTE_NAMES.indexOf(name.replace(/[0-9]/g, "")), ((midi % 12) + 12) % 12);
  }
});
