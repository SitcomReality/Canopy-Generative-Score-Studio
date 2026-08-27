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

// Which kit node realizes a percussion piece (mirrors the runtime's kitNode).
// Snare falls back to the hat on a kit without a dedicated snare node.
export function kitNode(voice, piece) {
  const kit = voice?.kit;
  if (!kit) return null;
  switch (piece) {
    case "kick": return kit.kick;
    case "tom-hi":
    case "tom-lo":
    case "bongo-hi":
    case "bongo-lo": return kit.drum;
    case "rim":
    case "keyed":
    case "steel": return kit.tone;
    case "hat": return kit.hat;
    case "hat-open": return kit["hat-open"];
    case "shaker": return kit.shaker;
    case "snare": return kit.snare ?? kit.hat;
    default: return null;
  }
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
    let node = voice.synth;
    if (!pitched) {
      if (voice.kit) {
        node = kitNode(voice, ev.kind);
      } else {
        // Legacy voice bundle (kick/hat/snare), used by the collision tests.
        node = ev.kind === "kick"
          ? voice.kick
          : ev.kind === "hat"
            ? voice.hat
            : ev.kind === "snare"
              ? (voice.snare ?? voice.hat)
              : null;
      }
    }
    if (!node) continue;
    sounding.push(ev.layerId);
    const when = resolveEventTime(ev.layerId, ev.kind, ev.offset, time, lastTimes);
    // Pluck voices have no velocity parameter; their serial velocity gain
    // (see voices.js) carries the note's expression instead.
    if (voice.velGain) voice.velGain.gain.setValueAtTime(voice.velGain.baseGain * ev.velocity, when);
    if (ev.kind === "chord") {
      node.triggerAttackRelease(chordNotes(score, ev.degree), ev.duration, when, ev.velocity);
    } else if (ev.kind === "scale") {
      node.triggerAttackRelease(
        midiToNote(scaleMidi(score, ev.degree, ev.octave)),
        ev.duration,
        when,
        ev.velocity,
      );
    } else if (node.drumKind === "noise") {
      // NoiseSynth signature is (duration, time, velocity).
      node.triggerAttackRelease(ev.duration ?? "16n", when, ev.velocity);
    } else {
      // Membrane/Synth pitched drums: (note, duration, time, velocity). A kick
      // carries a fixed note (`ev.pitch`, e.g. "D1"); tonal pieces map their
      // scale degree through the song's key so they stay in-key.
      node.triggerAttackRelease(
        ev.pitch || midiToNote(scaleMidi(score, ev.degree, ev.octave ?? 4)),
        ev.duration ?? "16n",
        when,
        ev.velocity,
      );
    }
  }
  return sounding;
}