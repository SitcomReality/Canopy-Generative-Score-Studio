// Pure phrase-level variation: anchored motif drift for the long-form
// system (see dev/docs/songAuthoringGuide.md). The written phrase is never
// touched — callers pass a copy and get a mutated copy back. Every output
// step stays a scale degree 0..7 or null, so the harmony guard holds once
// degrees go through scaleMidi() as usual.
//
// Anchoring rules:
// - steps 0 and 15 (phrase start and tonic resolution) never mutate;
// - degree shifts move at most ±1 within the scale;
// - rests spawn notes near their neighbours instead of random leaps.

const clampDegree = (degree) => Math.max(0, Math.min(7, degree));

// Deterministic PRNG (mulberry32) so an exported score can reproduce the
// same drift sequence when the game wants predictability. A seed of 0 (or
// any non-positive/invalid value) means fully random.
export function makeRng(seed) {
  const s = Math.floor(Number(seed));
  if (!Number.isFinite(s) || s <= 0) return Math.random;
  let a = s >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mutateMotif(steps, rate, rng = Math.random) {
  const out = [...steps];
  const chance = (Math.max(0, Math.min(100, rate)) / 100) * 0.35;

  const mutableIndexes = [];
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] !== null) mutableIndexes.push(i);
    if (rng() >= chance * (out[i] === null ? 0.5 : 1)) continue;

    if (out[i] === null) {
      // Spawn: lean on the nearest sounding neighbour so phrases stay singable.
      let before = null;
      for (let j = i - 1; j >= 0; j--) if (out[j] !== null) { before = out[j]; break; }
      let after = null;
      for (let j = i + 1; j < out.length; j++) if (out[j] !== null) { after = out[j]; break; }
      const base = before ?? after ?? 0;
      out[i] = clampDegree(base + (rng() > 0.5 ? 1 : -1));
      continue;
    }

    const roll = rng();
    if (roll < 0.4) {
      out[i] = clampDegree(out[i] + (rng() > 0.5 ? 1 : -1));
    } else if (roll < 0.7) {
      out[i] = null;
    } else {
      const others = mutableIndexes.filter((index) => index !== i);
      if (others.length > 0) {
        const swapWith = others[Math.floor(rng() * others.length)];
        out[i] = out[swapWith];
        out[swapWith] = steps[i];
      }
    }
  }
  return out;
}

// Macro journey curve: slow-moving song-level energy (0..1) layered under
// the reactive game context. `bar` is the absolute bar counter; the cycle
// repeats every `length` bars. Depth scales away from a neutral 0.5 so
// depth 0 always means constant mid energy.
export function journeyEnergy(shape, depth, bar, length) {
  const span = Math.max(4, Math.round(length));
  const phase = (((bar % span) + span) % span) / span;
  let raw;
  if (shape === "arc") {
    // Build -> peak -> resolve across the whole cycle.
    raw = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  } else if (shape === "tide") {
    raw = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  } else {
    return 0.5;
  }
  const amount = Math.max(0, Math.min(100, depth)) / 100;
  return 0.5 + (raw - 0.5) * amount;
}
