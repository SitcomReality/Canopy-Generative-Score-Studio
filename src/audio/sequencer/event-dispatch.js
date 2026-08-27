// Triggering resolved dynamics events on the layer voices. Returns the layer
// ids that actually sound this step, for the UI's live indicators.
//
// The same-time collision guard lives HERE (the realization boundary). Tone
// requires each physical voice's start times to strictly increase in call
// order, or it throws "Start time must be strictly greater than previous start
// time". Stable-sorting by offset (orderEvents) handles within-step ordering,
// but it can't fix two events on one voice at the SAME offset, or a step whose
// last event overlaps the next step's first (dense fills, high swing, snare
// falling back to the hat). So we track the last absolute time dispatched per
// voice group and clamp any event that would collide to an inaudible epsilon
// after it. This is deterministic (given the event sequence) and never changes
// which notes play — only sub-millisecond realization timing for a colliding
// event, preserving seeded determinism.
import { chordNotes, scaleMidi } from "../../music/scale-math.js";
import { midiToNote } from "../../music/note-names.js";

const EPSILON = 0.001; // 1 ms — enough to keep Tone's strict-increase rule, below audibility

// Which physical voice an event lands on. hat and snare share one NoiseSynth
// (snare falls back to the hat on snareless kits), so they are one group; the
// pitched synth is one group; kick is its own MembraneSynth.
export function eventVoiceGroup(kind) {
  if (kind === "chord" || kind === "scale") return "synth";
  if (kind === "kick") return "kick";
  return "perc";
}

// Compute the realized start time for one event, enforcing strict increase per
// voice group. `lastTimes` is a caller-owned { "<layerId>|<group>": number }
// map that persists across steps. Returns the (possibly clamped) time.
export function resolveEventTime(layerId, kind, offset, base, lastTimes) {
  const key = `${layerId}|${eventVoiceGroup(kind)}`;
  const due = base + (offset ?? 0);
  const last = lastTimes[key];
  if (last !== undefined && due <= last) {
    lastTimes[key] = last + EPSILON;
    return lastTimes[key];
  }
  lastTimes[key] = due;
  return due;
}

export function dispatchEvents({ score, voices, events, time, lastTimes = {} }) {
  const sounding = [];
  for (const ev of events) {
    const voice = voices[ev.layerId];
    if (!voice) continue;
    // Pitched events need a synth voice; skip rather than crash on any
    // transient mismatch between the store's project and the voice graph.
    const pitched = ev.kind === "chord" || ev.kind === "scale";
    if (pitched && !voice.synth) continue;
    sounding.push(ev.layerId);
    const when = resolveEventTime(ev.layerId, ev.kind, ev.offset, time, lastTimes);
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