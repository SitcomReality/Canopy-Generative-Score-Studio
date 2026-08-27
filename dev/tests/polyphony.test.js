// Voice/polyphony budget tests. Tone's synthesis cost scales with concurrent
// voices; a dense arrangement can drive far more than a low-end machine renders
// per audio callback. These tests pin the pure budgeting helpers in
// audio/sequencer/polyphony.js: note sizing, duration, keep-priority ordering,
// and that thinning is deterministic and respects the budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  noteVoices,
  noteDurSec,
  eventPriority,
  thinByBudget,
  activeVoiceCost,
} from "../../src/audio/sequencer/polyphony.js";

const role = (layerId) => layerId;

test("noteVoices: a chord is 3 voices, others are 1", () => {
  assert.equal(noteVoices({ kind: "chord" }), 3);
  assert.equal(noteVoices({ kind: "scale" }), 1);
  assert.equal(noteVoices({ kind: "kick" }), 1);
  assert.equal(noteVoices({ kind: "hat" }), 1);
  assert.equal(noteVoices({ kind: "snare" }), 1);
});

test("noteDurSec converts time-strings to seconds given a bpm", () => {
  assert.equal(noteDurSec("4n", 120), 0.5); // quarter = 1 beat = 0.5s at 120
  assert.equal(noteDurSec("16n", 120), 0.125);
  assert.equal(noteDurSec("n", 60), 4); // whole = 4 beats = 4s at 60
  assert.ok(noteDurSec("unknown", 120) > 0); // graceful fallback
});

test("eventPriority ranks structural above fills", () => {
  assert.ok(eventPriority({ kind: "kick" }, "percussion") > eventPriority({ kind: "chord" }, "harmony"));
  assert.ok(eventPriority({ kind: "chord" }, "harmony") > eventPriority({ kind: "scale" }, "motif"));
  assert.ok(eventPriority({ kind: "scale" }, "bass") > eventPriority({ kind: "scale" }, "motif"));
  assert.ok(eventPriority({ kind: "snare" }, "percussion") > eventPriority({ kind: "hat" }, "percussion"));
});

test("thinByBudget keeps high-priority events and preserves order", () => {
  const events = [
    { kind: "hat", layerId: "p", offset: 0.01 },
    { kind: "kick", layerId: "p", offset: 0 },
    { kind: "scale", layerId: "m", offset: 0.02 },
    { kind: "chord", layerId: "h", offset: 0 },
  ];
  // budget 4: chord(3) + kick(1) = 4 exactly fills it; scale(1) and hat(1)
  // are dropped (lower priority). Original order preserved for the survivors.
  const kept = thinByBudget(events, 0, 4, role);
  const ids = kept.map((e) => e.kind);
  assert.deepEqual(ids, ["kick", "chord"]);
});

test("thinByBudget drops fills/ghosts first when the mix is over budget", () => {
  const events = [
    { kind: "hat", layerId: "p", offset: 0.02 }, // priority 1
    { kind: "snare", layerId: "p", offset: 0.06 }, // priority 2
    { kind: "scale", layerId: "m", offset: 0 }, // priority 3
    { kind: "kick", layerId: "p", offset: 0 }, // priority 5
    { kind: "scale", layerId: "b", offset: 0 }, // bass priority 5
  ];
  const kept = thinByBudget(events, 0, 3, role);
  const ids = kept.map((e) => `${e.kind}:${e.layerId}`).sort();
  // Voices: all 1 each. Budget 3 keeps the 3 highest-priority (kick, bass, motif scale), drops snare+hat.
  assert.deepEqual(ids, ["kick:p", "scale:b", "scale:m"]);
});

test("thinByBudget respects the active cost (sustaining notes eat the budget)", () => {
  const events = [
    { kind: "kick", layerId: "p", offset: 0 },
    { kind: "scale", layerId: "m", offset: 0 },
  ];
  // active cost 2 + this step 2 = 4 > budget 3 -> keep only the highest-priority (kick) and 1 of them? 
  // budget 3, active 2 -> room for 1 more; highest remaining is kick(1).
  const kept = thinByBudget(events, 2, 3, role);
  assert.deepEqual(kept.map((e) => e.kind), ["kick"]);
});

test("activeVoiceCost sums sustaining voices", () => {
  assert.equal(activeVoiceCost([{ cost: 2 }, { cost: 3 }]), 5);
  assert.equal(activeVoiceCost([]), 0);
});

test("thinning is deterministic for a given budget and event list", () => {
  const events = [
    { kind: "hat", layerId: "p", offset: 0.02 },
    { kind: "snare", layerId: "p", offset: 0.06 },
    { kind: "scale", layerId: "m", offset: 0 },
    { kind: "kick", layerId: "p", offset: 0 },
  ];
  const a = thinByBudget(events, 0, 3, role);
  const b = thinByBudget(events, 0, 3, role);
  assert.deepEqual(a, b);
});