// Layer editing actions: selection, mute, step toggling, composition,
// layer lifecycle (add/remove/rename/role), instruments, and the per-layer
// reactive schema (level trim, activity gate, fills).
import { DEFAULT_LAYERS, LAYER_ROLES, convertStepsForRole } from "../music/default-project.js";
import { composeMelody, composePattern, makeSparser } from "../music/melody-composer.js";
import { notify } from "../ui/toast.js";

const LAYER_PALETTE = ["#9dc98d", "#f1c97a", "#d98868", "#b8a5d7", "#7fb8c9", "#c9a3b8"];

// Route a compose request to the right generator for the layer's kind.
function composeLayerSteps(project, layer) {
  return LAYER_ROLES[layer.role].kind === "degrees" ? composeMelody(project, layer) : composePattern(layer);
}

export function createLayerActions(store, host) {
  const api = {
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

    // target: "selected" | "all" | a layer id. Degree layers get a composed
    // motif; on/off layers get a role-shaped pattern. Harmony guard holds
    // because degrees only ever come from composeMelody (scale-wrapped).
    composeLayers(target) {
      const { project, selectedTrack } = store.get();
      const chosen = target === "all"
        ? project.layers
        : target === "selected"
          ? project.layers.filter((layer) => layer.id === selectedTrack)
          : project.layers.filter((layer) => layer.id === target);
      if (chosen.length === 0) return;
      host.stopForHeavyEdit();
      const chosenIds = new Set(chosen.map((layer) => layer.id));
      const layers = project.layers.map((layer) =>
        chosenIds.has(layer.id)
          ? { ...layer, steps: composeLayerSteps(project, layer) }
          : layer);
      store.updateProject({ layers });
      notify(`Composed: ${chosen.map((layer) => layer.name).join(", ")}`);
    },

    makeSparser() {
      const { project, selectedTrack } = store.get();
      const target = project.layers.find((layer) => layer.id === selectedTrack && layer.role === "motif")
        ?? project.layers.find((layer) => layer.role === "motif");
      if (!target) {
        notify("Add a motif layer to simplify");
        return;
      }
      host.stopForHeavyEdit();
      const layers = project.layers.map((layer) =>
        layer.id === target.id
          ? { ...layer, steps: makeSparser(layer.steps), density: Math.max(20, layer.density - 12) }
          : layer);
      store.updateProject({ layers });
      notify("Motif simplified without changing its harmony");
    },

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

    setInstrument(layerId, instrument) {
      const layers = store.get().project.layers.map((layer) =>
        layer.id === layerId ? { ...layer, instrument } : layer);
      store.updateProject({ layers });
      host.engine?.setInstrument(layerId, instrument);
    },

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
  };
  return api;
}
