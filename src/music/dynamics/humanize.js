// Deterministic performance humanization derived from a layer's `humanize`
// %: micro-timing offsets and per-note velocity jitter. Both draw from the
// host's rng (seeded via variationSeed when set), so playback stays
// reproducible.

// Humanize timing offset (seconds). At 100% the loosest drag is ~90 ms;
// typical slider positions (10-30%) land in the perceptibly-loose 9-27 ms.
export function humanDelay(layer, rng) {
  return rng() * (layer.humanize ?? 0) / 100 * 0.09;
}

// Per-note velocity jitter around an automated/base velocity, scaled by the
// same humanize % (a "tight" layer plays machine-uniform, a "loose" one
// breathes). Deterministic via rng; result clamps to a musical floor/ceiling.
export function humanVelocity(layer, baseVelocity, rng) {
  const width = (layer.humanize ?? 0) / 100 * 0.24;
  const jitter = (rng() * 2 - 1) * width;
  return Math.max(0.05, Math.min(1, baseVelocity * (1 + jitter)));
}
