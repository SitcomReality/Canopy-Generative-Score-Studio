// Layers overview ("minimap"): one compact row per layer showing where notes
// land across the 16 steps, so the whole arrangement is readable at a glance
// without clicking through layers. Clicking a row selects that layer.
// The grid rebuilds only on project/selection changes; the per-step playhead
// and live "sounding now" highlights are class toggles without a rebuild.
import { LAYER_ROLES } from "../music/default-project.js";
import { renderOn } from "./render-batch.js";

export function initLayersOverview(store, actions) {
  const root = document.getElementById("layers-overview");
  if (!root) return;
  root.addEventListener("click", (event) => {
    const row = event.target.closest(".overview-row");
    if (row) actions.selectTrack(row.dataset.track);
  });

  renderOn(store, ["project", "selectedTrack"], () => render(root, store.get()));
  renderOn(store, ["step", "playing"], () => updatePlayhead(root, store.get()));
  // Live "sounding now" glow on rows whose layer triggered this step.
  renderOn(store, ["sounding"], () => paintSounding(root, store.get().sounding));

  render(root, store.get());
}

function hasNoteAt(layer, kind, step) {
  const value = layer.steps[step];
  return kind === "degrees" ? Number.isInteger(value) : Boolean(value);
}

function render(root, state) {
  const { project, selectedTrack } = state;
  const cellsFor = (layer) => {
    const kind = LAYER_ROLES[layer.role].kind;
    return Array.from({ length: 16 }, (_, s) =>
      `<i class="${hasNoteAt(layer, kind, s) ? " filled" : ""}" data-step="${s}"></i>`).join("");
  };

  root.innerHTML = `<div class="overview-heading"><span class="kicker">All layers</span></div>` +
    project.layers.map((layer) => `
      <div class="overview-row${layer.id === selectedTrack ? " selected" : ""}" data-track="${layer.id}" style="--row-color:${layer.color}" title="${layer.name}">
        <span class="overview-name">${layer.name}</span>
        <span class="overview-cells">${cellsFor(layer)}</span>
      </div>`).join("");
}

function updatePlayhead(root, state) {
  const { step, playing } = state;
  root.querySelectorAll(".overview-cells [data-step]").forEach((cell) => {
    cell.classList.toggle("current", playing && Number(cell.dataset.step) === step);
  });
}

function paintSounding(root, soundingIds) {
  const sounding = new Set(soundingIds ?? []);
  root.querySelectorAll(".overview-row").forEach((row) => {
    row.classList.toggle("sounding", sounding.has(row.dataset.track));
  });
}
