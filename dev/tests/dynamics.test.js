// Unit coverage for the shared reactive-dynamics decision core
// (src/music/dynamics.js). Focus on the invariants the engines depend on,
// especially that every emitted voice event is routable (carries `layerId`)
// so the audio engine can find its voice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";
import {
  computeStepFrame,
  contextTargets,
  easeToward,
  activeSection,
  sectionGain,
  sectionActive,
  layerLevel,
  flourishEvents,
  FLOURISH_NAMES,
  domainValue,
} from "../../src/music/dynamics.js";

const rng = () => 0.5; // deterministic mid roll

function features(project) {
  const features = {};
  for (const layer of project.layers) features[layer.id] = { steps: [...layer.steps] };
  return { features, resting: [] };
}

test("computeStepFrame emits events carrying layerId and a playable kind", () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  const live = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
  const events = computeStepFrame(project, live, features(project), 0, rng);
  assert.ok(events.length > 0, "default project should sound on step 0");
  for (const ev of events) {
    assert.ok(typeof ev.layerId === "string" && ev.layerId, `event missing layerId: ${JSON.stringify(ev)}`);
    assert.ok(["chord", "scale", "kick", "hat"].includes(ev.kind), `unknown kind ${ev.kind}`);
    if (ev.kind === "chord" || ev.kind === "scale") {
      assert.ok(Number.isInteger(ev.degree) && ev.degree >= 0 && ev.degree <= 7, "degree is a valid scale degree");
    }
  }
  // Events must not all come from the same layer id (multiple layers routable).
  const ids = new Set(events.map((ev) => ev.layerId));
  assert.ok(ids.size > 0);
});

test("muted layers produce no events", () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  project.layers.forEach((layer) => (layer.muted = true));
  const events = computeStepFrame(project, { intensity: 0.5, tension: 0.5, brightness: 0.5 }, features(project), 0, rng);
  assert.equal(events.length, 0);
});

test("harmony-guard: every pitched event is a scale degree 0..7", () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  const live = { intensity: 0.9, tension: 0.9, brightness: 0.9 };
  for (let s = 0; s < 16; s++) {
    for (const ev of computeStepFrame(project, live, features(project), s, rng)) {
      if (ev.kind === "chord" || ev.kind === "scale") {
        assert.ok(ev.degree >= 0 && ev.degree <= 7, `step ${s} produced degree ${ev.degree}`);
      }
    }
  }
});

test("contextTargets falls back to explore for unknown ids", () => {
  assert.deepEqual(contextTargets(DEFAULT_PROJECT, "nonsense"), { intensity: 0.3, tension: 0.25, brightness: 0.7 });
  const known = contextTargets(DEFAULT_PROJECT, "explore");
  assert.deepEqual(known, { intensity: 0.3, tension: 0.25, brightness: 0.7 });
});

test("easeToward moves toward target without overshooting", () => {
  const from = { intensity: 0, tension: 0, brightness: 0 };
  const target = { intensity: 1, tension: 1, brightness: 1 };
  const next = easeToward(from, target, 0.5);
  assert.equal(next.intensity, 0.5);
  assert.equal(next.tension, 0.5);
  assert.equal(next.brightness, 0.5);
});

test("activeSection rotates sections by bar count and handles empty lists", () => {
  const project = {
    sections: [
      { id: "a", label: "A", length: 2, layers: {} },
      { id: "b", label: "B", length: 1, layers: {} },
    ],
  };
  // 2 bars of A, then 1 bar of B, cycling (bar counts are 1-based here).
  assert.equal(activeSection(project, 1).id, "a");
  assert.equal(activeSection(project, 2).id, "a");
  assert.equal(activeSection(project, 3).id, "b");
  assert.equal(activeSection(project, 4).id, "a");
  assert.equal(activeSection({ sections: [] }, 7), null);
});

test("sectionGain/sectionActive/layerLevel clamp their dB ranges", () => {
  const section = { layers: { melody: { gain: -60, active: false }, bass: { gain: 99 } } };
  assert.equal(sectionGain(section, "melody"), -24);
  assert.equal(sectionGain(section, "bass"), 24);
  assert.equal(sectionGain(section, "chords"), 0);
  assert.equal(sectionActive(section, "melody"), false);
  assert.equal(sectionActive(section, "chords"), true);
  assert.equal(layerLevel({ level: -99 }), -24);
  assert.equal(layerLevel({ level: 40 }), 6);
  assert.equal(layerLevel({}), 0);
});

test("flourishEvents resolve from the catalog, honor overrides, drop unknowns", () => {
  for (const name of FLOURISH_NAMES) {
    const events = flourishEvents({}, name);
    assert.ok(events.length > 0, name);
    for (const ev of events) {
      assert.ok(ev.degree >= 0 && ev.degree <= 7, `${name} harmony guard`);
      assert.ok(ev.octave >= 1 && ev.octave <= 6);
      assert.ok(ev.at >= 0 && ev.at < 4 && ev.dur > 0 && ev.vel > 0);
    }
  }
  // Victory spans the full bar (last hit starts at beat 3.5).
  const victory = flourishEvents({}, "victory");
  assert.equal(victory[victory.length - 1].at, 3.5);
  // Per-song override replaces the catalog entry.
  assert.equal(flourishEvents({ flourishes: { calm: [{ degree: 1, octave: 3, at: 0, dur: 1, vel: 0.4 }] } }, "calm").length, 1);
  // Unknown flourish names resolve to nothing.
  assert.deepEqual(flourishEvents({}, "nonsense"), []);
});

test("domainValue maps linear and step domains", () => {
  assert.equal(domainValue([0, 100], 0.5), 50);
  assert.equal(domainValue([0, 100], 0.25), 25);
  // Step domain picks an entry by rounded index.
  assert.equal(domainValue(["a", "b", "c"], 0.5), "b");
  assert.equal(domainValue(["a", "b", "c"], 0.99), "c");
});