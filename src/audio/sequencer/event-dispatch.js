// Triggering resolved dynamics events on the layer voices. Returns the layer
// ids that actually sound this step, for the UI's live indicators.
import { chordNotes, scaleMidi } from "../../music/scale-math.js";
import { midiToNote } from "../../music/note-names.js";

export function dispatchEvents({ score, voices, events, time }) {
  const sounding = [];
  for (const ev of events) {
    const voice = voices[ev.layerId];
    if (!voice) continue;
    // Pitched events need a synth voice; skip rather than crash on any
    // transient mismatch between the store's project and the voice graph.
    const pitched = ev.kind === "chord" || ev.kind === "scale";
    if (pitched && !voice.synth) continue;
    sounding.push(ev.layerId);
    const when = time + (ev.offset ?? 0);
    // Pluck voices have no velocity parameter; their serial velocity gain
    // (see voices.js) carries the note's expression instead.
    if (voice.velGain) voice.velGain.gain.setValueAtTime(voice.velGain.baseGain * ev.velocity, when);
    if (ev.kind === "chord") {
      voice.synth.triggerAttackRelease(chordNotes(score, ev.degree), ev.duration, when, ev.velocity);
    } else if (ev.kind === "scale") {
      voice.synth.triggerAttackRelease(
        midiToNote(scaleMidi(score, ev.degree, ev.octave)),
        ev.duration,
        when,
        ev.velocity,
      );
    } else if (ev.kind === "kick") {
      voice.kick.triggerAttackRelease(ev.pitch ?? "D1", ev.duration, when, ev.velocity);
    } else if (ev.kind === "hat") {
      // NoiseSynth signature is (duration, time, velocity).
      voice.hat.triggerAttackRelease(ev.duration ?? "32n", when, ev.velocity);
    } else if (ev.kind === "snare") {
      const target = voice.snare ?? voice.hat;
      target.triggerAttackRelease(ev.duration ?? "16n", when, ev.velocity);
    }
  }
  return sounding;
}
