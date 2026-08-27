// Direct grid edits: mute, track selection, and toggling cells on the
// selected layer (degree lane for pitched layers, beat on/off for patterns).
export function createStepEditingActions(store, host) {
  return {
    toggleMute(layerId) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId ? { ...layer, muted: !layer.muted } : layer);
      const layer = layers.find((item) => item.id === layerId);
      store.updateProject({ layers });
      // Mute is gate-only: keep the engine's gate in sync with the persisted
      // project field so playback flows identically through the toggle (it
      // never re-anchors, rebuilds, or alters the RNG stream).
      host.engine?.setLayerMuted(layerId, Boolean(layer?.muted));
    },

    selectTrack(track) {
      store.set({ selectedTrack: track });
    },

    // Toggle a note lane cell on the selected degree layer.
    setDegreeStep(step, degree) {
      const { project, selectedTrack } = store.get();
      const layers = project.layers.map((layer) => {
        if (layer.id !== selectedTrack) return layer;
        const steps = [...layer.steps];
        steps[step] = steps[step] === degree ? null : degree;
        return { ...layer, steps };
      });
      store.updateProject({ layers });
    },

    // Toggle a beat on the selected on/off layer.
    toggleLayerStep(step) {
      const { project, selectedTrack } = store.get();
      const layers = project.layers.map((layer) => {
        if (layer.id !== selectedTrack) return layer;
        const steps = [...layer.steps];
        steps[step] = !steps[step];
        return { ...layer, steps };
      });
      store.updateProject({ layers });
    },
  };
}
