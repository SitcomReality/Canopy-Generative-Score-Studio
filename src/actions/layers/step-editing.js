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

    // Toggle a beat on the selected hit-list layer. `at` is the onset fraction
    // of the step (0..1); `piece` is the kit piece for percussion layers and is
    // ignored for harmony/bass (the role decides the voice). Clicking toggles a
    // hit with that exact (at, piece) in or out of the step's hit list.
    toggleLayerHit(step, at, piece) {
      const { project, selectedTrack } = store.get();
      const layers = project.layers.map((layer) => {
        if (layer.id !== selectedTrack) return layer;
        const perc = layer.role === "percussion" || layer.role === "drums";
        const hits = [...layer.steps];
        const list = Array.isArray(hits[step]) ? [...hits[step]] : [];
        const index = list.findIndex((h) => {
          if (Math.abs((h.at ?? 0) - at) > 1e-9) return false;
          return perc ? h.piece === piece : true;
        });
        if (index >= 0) {
          list.splice(index, 1);
        } else {
          const hit = { at };
          if (perc) hit.piece = piece;
          list.push(hit);
        }
        hits[step] = list.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
        return { ...layer, steps: hits };
      });
      store.updateProject({ layers });
    },
  };
}
