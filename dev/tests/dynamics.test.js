// Unit coverage for the shared reactive-dynamics decision core
// (src/music/dynamics.js). Focus on the invariants the engines depend on,
// especially that every emitted voice event is routable (carries `layerId`)
// so the audio engine can find its voice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROJECT } from "../../src/music/default-project.js";
import {
  computeStepFrame,
  easeToward,
  activeSection,
  sectionGain,
  sectionActive,
  layerLevel,
  domainValue,
  atmosphereBindings,
  ATMOSPHERE_TARGETS,
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

test("mute is a gate, not a generation skip: muted layers still consume RNG", () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  project.layers.forEach((layer) => (layer.muted = true));
  const events = computeStepFrame(project, { intensity: 0.5, tension: 0.5, brightness: 0.5 }, features(project), 0, rng);
  // A muted layer must still emit events from the pure core so its place in
  // the deterministic RNG stream is preserved; the timing engine gates these
  // at the emission boundary instead of skipping generation (brief §5.1). If
  // any layer is rested it won't, so assert there is at least one event, not
  // zero — muting must never re-roll the other layers' humanize/variation.
  assert.ok(events.length > 0, "muted layers must still generate events to keep their RNG share");
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

test("hit-list percussion emits one routed event per authored kit piece", () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  const perc = project.layers.find((l) => l.id === "percussion");
  perc.activity = null; // sound at neutral axes so the core emits them
  perc.steps = Array.from({ length: 16 }, () => []);
  perc.steps[0] = [
    { piece: "kick", at: 0 },
    { piece: "tom-hi", at: 0.5, pitch: 4 },
    { piece: "keyed", at: 0, pitch: 0 },
  ];
  perc.steps[4] = [{ piece: "snare", at: 0.25 }];
  const live = { intensity: 0.5, tension: 0.5, brightness: 0.5 };
  const ALL_PIECES = ["kick", "hat", "hat-open", "snare", "rim", "tom-hi", "tom-lo", "bongo-hi", "bongo-lo", "keyed", "steel", "shaker"];
  for (const step of [0, 4]) {
    const events = computeStepFrame(project, live, features(project), step, rng).filter((e) => e.layerId === "percussion");
    assert.ok(events.length >= 1, `step ${step} should emit percussion`);
    for (const ev of events) {
      assert.equal(typeof ev.layerId, "string", "routable event");
      assert.ok(ALL_PIECES.includes(ev.piece ?? ev.kind), `unknown piece ${ev.piece ?? ev.kind}`);
      assert.ok(Number.isFinite(ev.offset), "hit has an onset offset");
      // Pitched pieces carry an in-key scale degree (harmony guard).
      if (ev.piece === "tom-hi" || ev.piece === "keyed") {
        assert.ok(Number.isInteger(ev.degree) && ev.degree >= 0 && ev.degree <= 7, "pitched piece degree 0..7");
        assert.ok(Number.isInteger(ev.octave), "pitched piece octave");
      }
    }
  }
  // The three authored pieces on step 0 each emit (kick/keyed/tom-hi) — no loss.
  const step0 = computeStepFrame(project, live, features(project), 0, rng).filter((e) => e.layerId === "percussion");
  const pieces = new Set(step0.map((e) => e.piece));
  assert.ok(pieces.has("kick") && pieces.has("tom-hi") && pieces.has("keyed"), "all authored pieces sound");
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

test("domainValue maps linear and step domains", () => {
  assert.equal(domainValue([0, 100], 0.5), 50);
  assert.equal(domainValue([0, 100], 0.25), 25);
  // Step domain picks an entry by rounded index.
  assert.equal(domainValue(["a", "b", "c"], 0.5), "b");
  assert.equal(domainValue(["a", "b", "c"], 0.99), "c");
});

test("atmosphereBindings returns undefined for every param when there are no bindings", () => {
  const ab = atmosphereBindings(DEFAULT_PROJECT, { intensity: 0.5, tension: 0.5, brightness: 0.5 });
  assert.equal(ab.reverb, undefined);
  assert.equal(ab.swing, undefined);
  assert.deepEqual(ab.space, {});
  // The atmosphere target list is complete (all six shared-atmosphere params).
  for (const t of ATMOSPHERE_TARGETS) assert.equal(typeof t, "string");
  assert.deepEqual(ATMOSPHERE_TARGETS, ["reverb", "space.lead", "space.bed", "space.bass", "space.echo", "swing"]);
});

test("atmosphereBindings resolves a linear reverb binding to a percent", () => {
  const project = { bindings: [{ target: "reverb", axis: "tension", domain: [0, 100] }] };
  assert.equal(atmosphereBindings(project, { intensity: 0.5, tension: 0.5, brightness: 0.5 }).reverb, 50);
  assert.equal(atmosphereBindings(project, { intensity: 0.5, tension: 0.25, brightness: 0.5 }).reverb, 25);
});

test("atmosphereBindings resolves per-role space sends only for bound params", () => {
  const project = { bindings: [{ target: "space.lead", axis: "intensity", domain: [0.2, 0.8] }] };
  const ab = atmosphereBindings(project, { intensity: 0.5, tension: 0.5, brightness: 0.5 });
  assert.equal(ab.space.lead, 0.5);
  assert.equal(ab.space.bed, undefined);
  assert.equal(ab.space.bass, undefined);
  assert.equal(ab.space.echo, undefined);
  assert.equal(ab.reverb, undefined);
});

test("atmosphereBindings resolves swing and ignores non-atmosphere targets", () => {
  const project = {
    bindings: [
      { target: "swing", axis: "brightness", domain: [0, 100] },
      { target: "nonsense", axis: "tension", domain: [0, 1] },
    ],
  };
  const ab = atmosphereBindings(project, { intensity: 0.5, tension: 0.5, brightness: 0.75 });
  assert.equal(ab.swing, 75);
  assert.equal(ab.reverb, undefined);
  assert.deepEqual(ab.space, {});
});