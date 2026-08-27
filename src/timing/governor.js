// Adaptive performance governor (pure). The engine's lookahead tick loop
// normally dispatches 0-1 due steps per tick. When a single tick must catch up
// 2+ steps at once, the main thread fell behind the audio clock (GC, a busy
// game frame, a slow machine) — the lookahead absorbed a drop. That is the
// signal this governor uses to shrink the voice budget, thinning the mix until
// the audio callback can keep up. It is conservative (hysteresis, min/max
// bounds, slow steps) so it never oscillates or thrashes a healthy system.
//
// It is pure and Tone/DOM-free so it runs under node:test.

export function createGovernor(initialBudget, {
  min = 8,
  max = 32,
  stepDown = 4, // voices removed when under sustained strain
  stepUp = 2, // voices added back when healthy for a full window
  window = 48, // ticks per decision (48 * ~25ms ≈ 1.2s)
  strainRatio = 0.25, // fraction of ticks that must be strained to step down
  healthyRatio = 0.05, // fraction of ticks strained to count as "healthy"
} = {}) {
  let budget = Math.max(min, Math.min(max, initialBudget));
  const samples = new Array(window).fill(false); // ring buffer, true = strained tick
  let head = 0;
  let filled = 0;

  // `strained` = this tick had to dispatch 2+ due steps (a catch-up burst).
  // Returns the (possibly changed) absolute budget whenever a decision lands,
  // otherwise null.
  function observe(strained) {
    samples[head] = strained;
    head = (head + 1) % window;
    if (filled < window) filled += 1;
    if (filled < window) return null;

    const strainedCount = samples.reduce((n, s) => n + (s ? 1 : 0), 0);
    const ratio = strainedCount / window;

    if (ratio > strainRatio && budget > min) {
      budget = Math.max(min, budget - stepDown);
      return budget;
    }
    if (ratio <= healthyRatio && budget < max) {
      budget = Math.min(max, budget + stepUp);
      return budget;
    }
    return null;
  }

  return {
    observe,
    get budget() {
      return budget;
    },
  };
}