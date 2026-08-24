// Layers overview ("minimap"): one compact row per layer showing where notes
// land across the 16 steps, so the whole arrangement is readable at a glance
// without clicking through layers. Clicking a row selects that layer.
// Re-renders on project/selection/step changes (the grid is tiny); live
// "sounding now" highlights are toggled as classes without a rebuild.
import { LAYER_ROLES } from "../music/default-project.js";

export function initLayersOverview(store, actions) {
  const root = document.getElementById("layers-overview");
  if (!root) return;
  root.addEventListener("click", (event) => {
    const row = event.target.closest(".overview-row");
    if (row) actions.selectTrack(row.dataset.track);
  });

  store.subscribe((changed) => {
    if (changed.includes("project") || changed.includes("selectedTrack") || changed.includes("step") || changed.includes("playing")) {
      render(root, store.get());
    }
    if (changed.includes("sounding")) {
      const sounding = new Set(store.get().sounding ?? []);
      root.querySelectorAll(".overview-row").forEach((row) => {
        row.classList.toggle("sounding", sounding.has(row.dataset.track));
      });
    }
  });

  render(root, store.get());
}

function hasNoteAt(layer, kind, step) {
  const value = layer.steps[step];
  return kind === "degrees" ? Number.isInteger(value) : Boolean(value);
}

function render(root, state) {
  const { project, selectedTrack, step, playing } = state;
  const cellsFor = (layer) => {
    const kind = LAYER_ROLES[layer.role].kind;
    return Array.from({ length: 16 }, (_, s) =>
      `<i class="${hasNoteAt(layer, kind, s) ? " filled" : ""}${s === step && playing ? " current" : ""}"></i>`).join("");
  };

  root.innerHTML = `<div class="overview-heading"><span class="kicker">All layers</span></div>` +
    project.layers.map((layer) => `
      <div class="overview-row${layer.id === selectedTrack ? " selected" : ""}" data-track="${layer.id}" style="--row-color:${layer.color}" title="${layer.name}">
        <span class="overview-name">${layer.name}</span>
        <span class="overview-cells">${cellsFor(layer)}</span>
      </div>`).join("");
}
