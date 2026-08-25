// One-shot flourishes (v5): a queued game milestone plays across one bar via
// the lead voice, then resolves the context it narrates. Returns the resolve
// context whether or not a lead voice existed — the resolution always applies.
import { flourishEvents } from "../../music/dynamics.js";
import { midiToNote } from "../../music/note-names.js";
import { scaleMidi } from "../../music/scale-math.js";

// The flourish resolves what it dramatizes: victory/defeat/calm settle back
// to exploration, combat commits to combat, unease lingers tense.
const RESOLVE_CONTEXT = {
  victory: "explore",
  defeat: "explore",
  calm: "explore",
  relief: "explore",
  combat: "combat",
  unease: "unease",
};

export function playFlourish({ score, leadVoice, time, name }) {
  if (leadVoice?.synth) {
    const spb = 60 / score.bpm;
    for (const ev of flourishEvents(score, name)) {
      leadVoice.synth.triggerAttackRelease(
        midiToNote(scaleMidi(score, ev.degree, ev.octave)),
        ev.dur * spb,
        time + ev.at * spb,
        ev.vel,
      );
    }
  }
  return RESOLVE_CONTEXT[name];
}
