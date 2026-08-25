// Layer lifecycle: creation, selection focus, renaming, removal, and role
// changes (which convert step data between the two step encodings).
import { DEFAULT_LAYERS, LAYER_ROLES, convertStepsForRole } from "../../music/default-project.js";
import { notify } from "../../ui/toast.js";

const LAYER_PALETTE = ["#9dc98d", "#f1c97a", "#d98868", "#b8a5d7", "#7fb8c9", "#c9a3b8"];

export function createLifecycleActions(store, host) {
  const api = {
    addLayer() {
      const { project } = store.get();
      const index = project.layers.length;
      const layer = {
        id: `layer-${Date.now().toString(36)}`,
        name: index >= DEFAULT_LAYERS.length ? `New layer ${index - DEFAULT_LAYERS.length + 1}` : "New layer",
        detail: "Main motif",
        role: "motif",
        color: LAYER_PALETTE[index % LAYER_PALETTE.length],
        muted: false,
        instrument: "Glass bell",
        instrumentConfig: null,
        density: 50,
        variation: 30,
        humanize: 15,
        restWindow: 0,
        energyRole: "balanced",
        activity: null,
        fills: null,
        automation: [],
        steps: Array(16).fill(null),
      };
      store.updateProject({ layers: [...project.layers, layer] });
      store.set({ selectedTrack: layer.id });
      host.stopForHeavyEdit();
      host.rebuild();
      notify(`${layer.name} added — rename it in the Selected layer panel`);
      api.beginRenameLayer();
    },

    beginRenameLayer() {
      const input = document.getElementById("refine-track-name");
      if (!input) return;
      input.focus();
      input.select();
    },

    renameLayer(layerId, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId ? { ...layer, name: trimmed } : layer);
      store.updateProject({ layers });
    },

    removeLayer(layerId) {
      const { project, selectedTrack } = store.get();
      if (project.layers.length <= 1) {
        notify("A score needs at least one layer");
        return;
      }
      const layers = project.layers.filter((layer) => layer.id !== layerId);
      store.updateProject({ layers });
      if (selectedTrack === layerId) store.set({ selectedTrack: layers[0].id });
      host.stopForHeavyEdit();
      host.rebuild();
      notify("Layer removed");
    },

    setLayerRole(layerId, role) {
      if (!layerId) return;
      const { project } = store.get();
      const layers = project.layers.map((layer) => {
        if (layer.id !== layerId || layer.role === role) return layer;
        return {
          ...layer,
          role,
          detail: LAYER_ROLES[role].label,
          steps: convertStepsForRole(layer.steps, layer.role, role),
        };
      });
      store.updateProject({ layers });
      host.stopForHeavyEdit();
      host.rebuild();
      notify("Layer role changed");
    },
  };
  return api;
}
