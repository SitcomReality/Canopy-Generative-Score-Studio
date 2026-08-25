// Emitted-source part: deterministic PRNG + long-form phrase drift — a flat
// mirror of variation.js for the standalone runtime.
export const VARIATION_SRC = `// ---- deterministic PRNG + long-form drift (mirror of variation.js) ----
const clampDegree = (d) => Math.max(0, Math.min(7, d));
function makeRng(seed) {
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
function mutateMotif(rate, steps, rng = Math.random) {
  const out = [...steps];
  const chance = (Math.max(0, Math.min(100, rate)) / 100) * 0.35;
  for (let i = 1; i < out.length - 1; i++) {
    if (rng() >= chance * (out[i] === null ? 0.5 : 1)) continue;
    if (out[i] === null) {
      let before = null;
      for (let j = i - 1; j >= 0; j--) if (out[j] !== null) { before = out[j]; break; }
      let after = null;
      for (let j = i + 1; j < out.length; j++) if (out[j] !== null) { after = out[j]; break; }
      out[i] = clampDegree((before ?? after ?? 0) + (rng() > 0.5 ? 1 : -1));
      continue;
    }
    const roll = rng();
    if (roll < 0.4) {
      out[i] = clampDegree(out[i] + (rng() > 0.5 ? 1 : -1));
    } else if (roll < 0.7) {
      out[i] = null;
    } else {
      const others = [];
      for (let k = 1; k < out.length - 1; k++) if (out[k] !== null && k !== i) others.push(k);
      if (others.length > 0) {
        const swapWith = others[Math.floor(rng() * others.length)];
        out[i] = out[swapWith];
        out[swapWith] = steps[i];
      }
    }
  }
  return out;
}`;
