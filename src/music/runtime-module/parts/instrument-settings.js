// Emitted-source part: instrument preset lookup plus the per-layer
// instrumentConfig override helpers. This is a verbatim mirror of
// instrument-override.js, flattened for the standalone .score.js file.
export const INSTRUMENT_SETTINGS_SRC = `function instrumentSettings(instrument, role) {
  const preset = INSTRUMENTS[instrument] || INSTRUMENTS["Glass bell"];
  return preset[role];
}

// ---- per-layer instrument overrides (mirror of instrument-override.js) ---
const OVERRIDE_WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];
const ENVELOPE_RANGES = { attack: [0, 4], decay: [0.01, 6], sustain: [0, 1], release: [0, 12] };
function clampRange(value, range) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(range[0], Math.min(range[1], num)) : num;
}
function sanitizeInstrumentConfig(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  if (OVERRIDE_WAVEFORMS.includes(raw.oscillator)) out.oscillator = raw.oscillator;
  if (raw.envelope && typeof raw.envelope === "object") {
    const envelope = {};
    for (const key of Object.keys(ENVELOPE_RANGES)) {
      const value = Number(raw.envelope[key]);
      if (Number.isFinite(value)) envelope[key] = clampRange(value, ENVELOPE_RANGES[key]);
    }
    if (Object.keys(envelope).length > 0) out.envelope = envelope;
  }
  return Object.keys(out).length > 0 ? out : null;
}
function resolveInstrumentConfig(layer, role) {
  // v6: a custom instrument (score.instruments) overrides the catalog preset.
  const custom = (typeof score !== "undefined") ? (score.instruments?.[layer.instrument]) : undefined;
  const base = custom
    ? (role === "percussion" ? (custom.percussion || {}) : (custom.voice || {}))
    : instrumentSettings(layer.instrument, role);
  const override = sanitizeInstrumentConfig(layer.instrumentConfig);
  if (!override) return base;
  const oscillator = override.oscillator, envelope = override.envelope;
  const merged = Object.assign({}, base, override);
  delete merged.oscillator;
  delete merged.envelope;
  if (oscillator !== undefined) {
    const shape = typeof base.oscillator === "object" && base.oscillator !== null ? base.oscillator : {};
    merged.oscillator = Object.assign({}, shape, { type: oscillator });
  }
  if (envelope !== undefined || base.envelope) {
    merged.envelope = Object.assign({}, base.envelope || {}, envelope || {});
  }
  return merged;
}`;
