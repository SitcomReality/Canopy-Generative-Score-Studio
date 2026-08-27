// Adaptive governor tests. The governor shrinks the voice budget when the
// engine's tick loop repeatedly has to catch up 2+ steps (main thread behind
// the audio clock), and restores it when the system is healthy. Pure and
// deterministic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGovernor } from "../../src/timing/governor.js";

test("governor does nothing until its window fills", () => {
  const g = createGovernor(20, { window: 10 });
  for (let i = 0; i < 9; i += 1) {
    assert.equal(g.observe(true), null);
  }
  assert.equal(g.budget, 20);
});

test("sustained strain steps the budget down", () => {
  const g = createGovernor(20, { window: 10, stepDown: 4, min: 8, strainRatio: 0.5 });
  let change = null;
  for (let i = 0; i < 10; i += 1) {
    change = g.observe(true) ?? change;
  }
  assert.equal(change, 16);
  assert.equal(g.budget, 16);
});

test("healthy ticks step the budget back up toward the max", () => {
  const g = createGovernor(12, { window: 10, stepUp: 2, max: 32, healthyRatio: 0.05 });
  let change = null;
  for (let i = 0; i < 10; i += 1) {
    change = g.observe(false) ?? change;
  }
  assert.equal(change, 14);
  assert.equal(g.budget, 14);
});

test("governor respects the min/max bounds", () => {
  const g = createGovernor(9, { window: 10, stepDown: 4, min: 8, strainRatio: 0.5 });
  for (let round = 0; round < 3; round += 1) {
    for (let i = 0; i < 10; i += 1) g.observe(true);
  }
  assert.equal(g.budget, 8); // clamped at min, never below
});

test("a mixed window produces no change (hysteresis)", () => {
  const g = createGovernor(20, { window: 10, strainRatio: 0.5, healthyRatio: 0.05 });
  // 4 strained out of 10 -> ratio 0.4 : below strain (0.5), above healthy (0.05).
  for (let i = 0; i < 10; i += 1) {
    assert.equal(g.observe(i < 4), null);
  }
  assert.equal(g.budget, 20);
});