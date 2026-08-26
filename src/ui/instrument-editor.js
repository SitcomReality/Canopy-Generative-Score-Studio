// Instrument editor: per-layer sound tweaks for the selected layer. Edits
// the layer's instrumentConfig override (waveform + ADSR envelope) live via
// the engine; sliders show the effective value (preset value until you
// move one). Hidden entirely for percussion layers and pluck-voice presets,
// whose Karplus-strong voices have no oscillator/envelope to tweak.
import { createParameterSlider } from "./parameter-slider.js";
import { resolveInstrumentConfig } from "../music/instrument-override.js";

const WAVEFORMS = ["sine", "triangle", "square", "sawtooth"];

// Slider ranges mirror sanitizeInstrumentConfig's clamps.
const ENVELOPE_SLIDERS = [
  { key: "attack", label: "Attack", low: "Instant", high: "Swells in", max: 4 },
  { key: "decay", label: "Decay", low: "Quick fade", high: "Long fade", max: 6 },
  { key: "sustain", label: "Sustain", low: "Dies away", high: "Holds", max: 1 },
  { key: "release", label: "Release", low: "Stops dead", high: "Rings out", max: 12 },
];

export function initInstrumentEditor(store, actions) {
  const root = document.getElementById("instrument-editor");
  const waveformSelect = document.getElementById("waveform-select");
  const resetButton = document.getElementById("reset-instrument-config");
  if (!root || !waveformSelect || !resetButton) return;

  const envelopeSliders = {};
  for (const def of ENVELOPE_SLIDERS) {
    envelopeSliders[def.key] = createParameterSlider(document.getElementById(`slider-${def.key}`), {
      label: def.label,
      low: def.low,
      high: def.high,
      onChange: (value) => actions.setInstrumentParam(selectedLayerId, { envelope: { [def.key]: (value / 100) * def.max } }),
    });
  }

  waveformSelect.addEventListener("change", () => {
    actions.setInstrumentParam(selectedLayerId, { oscillator: waveformSelect.value });
  });
  resetButton.addEventListener("click", () => actions.resetInstrumentConfig(selectedLayerId));

  let selectedLayerId = null;

  function paint(project, trackId) {
    const layer = project.layers.find((item) => item.id === trackId) ?? project.layers[0];
    selectedLayerId = layer.id;
    // Percussion kits aren't tweakable yet; plucks have no osc/envelope.
    const role = layer.role === "harmony" ? "harmony" : layer.role === "bass" ? "bass" : layer.role === "motif" ? "motif" : null;
    const editable = role !== null && resolveInstrumentConfig(layer, role).voice === undefined;
    root.hidden = !editable;
    if (!editable) return;

    const resolved = resolveInstrumentConfig(layer, role);
    const waveform = typeof resolved.oscillator === "object" && resolved.oscillator !== null
      ? resolved.oscillator.type
      : undefined;
    if (WAVEFORMS.includes(waveform)) waveformSelect.value = waveform;
    for (const def of ENVELOPE_SLIDERS) {
      const value = Number(resolved.envelope?.[def.key]);
      if (Number.isFinite(value)) envelopeSliders[def.key].set(Math.round((value / def.max) * 100));
    }
  }

  store.subscribe((changed) => {
    if (!changed.includes("project") && !changed.includes("selectedTrack")) return;
    const { project, selectedTrack } = store.get();
    paint(project, selectedTrack);
  });

  const { project, selectedTrack } = store.get();
  paint(project, selectedTrack);
}
