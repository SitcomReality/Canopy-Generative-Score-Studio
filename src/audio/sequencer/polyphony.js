// Pure voice/polyphony budgeting helpers. Tone's synthesis cost scales with the
// number of voices sounding at once; a dense arrangement (many motif layers,
// sustained chords, dense fills) can drive concurrent voices far past what a
// low-end machine can render per audio callback, producing dropouts and the
// benign "Max polyphony exceeded. Note dropped." warning. These helpers let the
// engine cap the mix to a deterministic voice budget, keeping the musically
// structural events and dropping the lowest-priority ones (fills, ghost hats)
// when the mix would exceed the budget.
//
// All functions are pure and side-effect free so they run under node:test.

// A chord (harmony) sounds as multiple simultaneous notes on one PolySynth;
// every other event is a single voice.
export function noteVoices(ev) {
  return ev.kind === "chord" ? 3 : 1;
}

// Note duration, in seconds, from the Tone time-string + the song BPM.
export function noteDurSec(duration, bpm) {
  const beatsPer = { n: 4, "2n": 2, "4n": 1, "8n": 0.5, "16n": 0.25, "32n": 0.125, "1m": 4, "1o": 4 };
  const beats = beatsPer[duration];
  if (beats === undefined) return 0.5 * 60 / bpm; // unknown -> one 8th
  return beats * 60 / bpm;
}

// Musical priority for thinning: higher = keep first. Structural downbeat
// events and the bass/harmony rhythm survive; fills and ghost hats are dropped
// first when the budget is tight.
export function eventPriority(ev, role) {
  switch (ev.kind) {
    case "kick": return 5;
    case "scale": return role === "bass" ? 5 : role === "motif" || role === "melody" ? 3 : 4;
    case "chord": return 4;
    case "snare": return 2;
    default: return 1; // hat and other ghosts
  }
}

export function roleOfLayer(project, layerId) {
  const layer = project.layers.find((item) => item.id === layerId);
  return layer?.role;
}

// Sum the cost (voices) currently active.
export function activeVoiceCost(active) {
  return active.reduce((sum, a) => sum + a.cost, 0);
}

// Drop events until `activeCost + retainedCost <= budget`, keeping the
// highest-priority ones (ties: lower offset first, i.e. the on-grid hit beats
// the fill ghost on the same voice). Returns the surviving `events` in their
// original order (so dispatch ordering/collision guard still applies).
export function thinByBudget(events, activeCost, budget, roleFn) {
  if (activeCost >= budget) return [];
  const sorted = [...events].sort((a, b) => {
    const pa = eventPriority(a, roleFn(a.layerId));
    const pb = eventPriority(b, roleFn(b.layerId));
    return pb - pa || (a.offset ?? 0) - (b.offset ?? 0);
  });
  let cost = activeCost;
  const kept = [];
  for (const ev of sorted) {
    const v = noteVoices(ev);
    if (cost + v <= budget) {
      kept.push(ev);
      cost += v;
    }
  }
  const order = new Map(events.map((ev, i) => [ev, i]));
  return kept.sort((a, b) => order.get(a) - order.get(b));
}