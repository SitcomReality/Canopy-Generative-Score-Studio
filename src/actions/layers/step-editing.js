// Direct grid edits: mute, track selection, and toggling cells on the
// selected layer (degree lane for pitched layers, beat on/off for patterns).
export function createStepEditingActions(store) {
  return {
    toggleMute(layerId) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId ? { ...layer, muted: !layer.muted } : layer);
      store.updateProject({ layers });
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
