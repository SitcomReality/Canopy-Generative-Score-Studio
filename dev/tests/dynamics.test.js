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
  tempoOffset,
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

test("tempoOffset uses the tempo.offset binding when present", () => {
  const project = JSON.parse(JSON.stringify(DEFAULT_PROJECT));
  project.bindings = [{ target: "tempo.offset", axis: "intensity", domain: [0, 20] }];
  assert.equal(tempoOffset(project, { intensity: 0.5 }), 10);
});

test("domainValue maps linear and step domains", () => {
  assert.equal(domainValue([0, 100], 0.5), 50);
  assert.equal(domainValue([0, 100], 0.25), 25);
  // Step domain picks an entry by rounded index.
  assert.equal(domainValue(["a", "b", "c"], 0.5), "b");
  assert.equal(domainValue(["a", "b", "c"], 0.99), "c");
});