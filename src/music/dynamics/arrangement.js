// Arrangement-level loudness shaping shared by both hosts.

// Per-layer volume bias (+/- dB) at a bar boundary from the macro journey
// energy and the layer's energyRole. Kept in the shared core so both engines
// ramp layer gain the same way.
export function journeyGain(layer, energy) {
  const bias = layer.energyRole === "forward" ? 3 : layer.energyRole === "recessive" ? -3 : 1.5;
  return ((energy - 0.5) * 2) * bias;
}
