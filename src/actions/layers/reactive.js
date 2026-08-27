// Per-layer reactive schema edits: the static level trim, the activity gate,
// and fill management (add/edit/remove/toggle steps).
export function createReactiveActions(store) {
  return {
    // A layer's static loudness trim in dB (-24..6).
    setLayerLevel(layerId, level) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId ? { ...layer, level: Math.max(-24, Math.min(6, Number(level) || 0)) } : layer);
      store.updateProject({ layers });
    },

    // activity: null clears the gate; otherwise { axis, range:[min,max] }.
    setLayerActivity(layerId, activity) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, activity: activity ? { axis: activity.axis, range: [...activity.range] } : null }
          : layer);
      store.updateProject({ layers });
    },

    addFill(layerId) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, fills: [...(layer.fills ?? []), { at: [14], axis: "intensity", threshold: 0.5 }] }
          : layer);
      store.updateProject({ layers });
    },

    updateFill(layerId, index, patch) {
      const layers = store.get().project.layers.map((layer) => {
        if (layer.id !== layerId || !layer.fills?.[index]) return layer;
        const fills = layer.fills.map((fill, i) => (i === index ? { ...fill, ...patch } : fill));
        return { ...layer, fills };
      });
      store.updateProject({ layers });
    },

    removeFill(layerId, index) {
      const layers = store.get().project.layers.map((layer) => {
        if (layer.id !== layerId || !layer.fills?.[index]) return layer;
        const fills = layer.fills.filter((_, i) => i !== index);
        return { ...layer, fills: fills.length > 0 ? fills : null };
      });
      store.updateProject({ layers });
    },

    toggleFillStep(layerId, index, step) {
      const layers = store.get().project.layers.map((layer) => {
        if (layer.id !== layerId || !layer.fills?.[index]) return layer;
        const fills = layer.fills.map((fill, i) => {
          if (i !== index) return fill;
          const at = fill.at.includes(step) ? fill.at.filter((value) => value !== step) : [...fill.at, step].sort((a, b) => a - b);
          return { ...fill, at };
        });
        return { ...layer, fills };
      });
      store.updateProject({ layers });
    },

    // ---- automation mapping management -------------------------------
    addLayerAutomation(layerId) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, automation: [...(layer.automation ?? []), { param: "velocity", axis: "intensity", domain: [0.3, 0.6] }] }
          : layer);
      store.updateProject({ layers });
    },

    setLayerAutomation(layerId, index, patch) {
      const layers = store.get().project.layers.map((layer) => {
        if (layer.id !== layerId || !layer.automation?.[index]) return layer;
        const automation = layer.automation.map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
        return { ...layer, automation };
      });
      store.updateProject({ layers });
    },

    removeLayerAutomation(layerId, index) {
      const layers = store.get().project.layers.map((layer) => {
        if (layer.id !== layerId || !layer.automation?.[index]) return layer;
        const automation = layer.automation.filter((_, i) => i !== index);
        return { ...layer, automation };
      });
      store.updateProject({ layers });
    },
  };
}
