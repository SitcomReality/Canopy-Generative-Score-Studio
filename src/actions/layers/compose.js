// Generative composition actions: route a compose request to the right
// generator for the layer's kind, and simplify an existing motif.
import { LAYER_ROLES } from "../../music/default-project.js";
import { composeMelody, composePattern, makeSparser } from "../../music/melody-composer.js";
import { notify } from "../../ui/toast.js";

function composeLayerSteps(project, layer) {
  return LAYER_ROLES[layer.role].kind === "degrees" ? composeMelody(project, layer) : composePattern(layer);
}

export function createComposeActions(store, host) {
  return {
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
  };
}
