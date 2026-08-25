// Per-layer instrument customization (tier 1): a partial override that is
// deep-merged over the catalog preset for the layer's role. Missing keys
// fall through to the preset, so an override only needs to state what
// differs. Applies to pitched roles (motif/harmony/bass); percussion kits
// and pluck voices ignore it — Karplus-strong plucks have no oscillator or
// envelope to tweak.
//
// Pure data-in/data-out: no DOM, no audio, no imports beyond the catalog.
import { instrumentSettings } from "./instruments.js";

// Waveforms offered by the inspector editor. FM presets keep their internal
// modulator shapes; this list governs the carrier oscillator only.
export const OVERRIDE_WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];

const ENVELOPE_RANGES = {
  attack: [0, 4],
  decay: [0.01, 6],
  sustain: [0, 1],
  release: [0, 12],
};

function clamp(value, [min, max], fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
}

// Normalize untrusted JSON into a safe override, or null when nothing valid
// remains. Unknown keys are dropped so hydration can never smuggle arbitrary
// synth options through an imported project.
export function sanitizeInstrumentConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (OVERRIDE_WAVEFORMS.includes(raw.oscillator)) out.oscillator = raw.oscillator;
  if (raw.envelope && typeof raw.envelope === "object") {
    const envelope = {};
    for (const key of Object.keys(ENVELOPE_RANGES)) {
      const value = Number(raw.envelope[key]);
      if (Number.isFinite(value)) envelope[key] = clamp(value, ENVELOPE_RANGES[key], value);
    }
    if (Object.keys(envelope).length > 0) out.envelope = envelope;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// The config a layer's role actually sounds: catalog preset with any
// per-layer override merged on top (top-level keys + one envelope level).
// Presets store `oscillator: { type }`; overrides use a bare waveform name,
// so the merge folds it into the preset's oscillator object. This is the
// single consumption point for both engines.
export function resolveInstrumentConfig(layer, role) {
  const base = instrumentSettings(layer.instrument, role);
  const override = sanitizeInstrumentConfig(layer.instrumentConfig);
  if (!override) return base;
  const { oscillator, envelope, ...rest } = override;
  const merged = { ...base, ...rest };
  if (oscillator !== undefined) {
    const shape = typeof base.oscillator === "object" && base.oscillator !== null ? base.oscillator : {};
    merged.oscillator = { ...shape, type: oscillator };
  }
  if (envelope !== undefined || base.envelope) {
    merged.envelope = { ...(base.envelope ?? {}), ...(envelope ?? {}) };
  }
  return merged;
}
