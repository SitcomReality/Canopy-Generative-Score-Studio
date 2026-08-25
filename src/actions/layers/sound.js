// Sound actions: preset swaps and per-layer instrumentConfig overrides
// ({ oscillator?, envelope? }), applied to the live engine voice immediately.
import { sanitizeInstrumentConfig } from "../../music/instrument-override.js";

export function createSoundActions(store, host) {
  return {
    setInstrument(layerId, instrument) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId ? { ...layer, instrument } : layer);
      store.updateProject({ layers });
      host.engine?.setInstrument(layerId, instrument);
    },

    // Merge a partial override into the layer's instrumentConfig and re-apply
    // it to the live voice.
    setInstrumentParam(layerId, patch) {
      const layers = store.get().project.layers.map((layer) => {
        if (layer.id !== layerId) return layer;
        const current = sanitizeInstrumentConfig(layer.instrumentConfig) ?? {};
        const envelope = { ...(current.envelope ?? {}), ...(patch.envelope ?? {}) };
        const next = sanitizeInstrumentConfig({
          oscillator: patch.oscillator ?? current.oscillator,
          envelope: Object.keys(envelope).length > 0 ? envelope : undefined,
        });
        return { ...layer, instrumentConfig: next };
      });
      store.updateProject({ layers });
      host.engine?.applyInstrumentConfig(layerId);
    },

    // Clear the override: back to the preset exactly as the catalog defines.
    resetInstrumentConfig(layerId) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId ? { ...layer, instrumentConfig: null } : layer);
      store.updateProject({ layers });
      host.engine?.applyInstrumentConfig(layerId);
    },
  };
}
