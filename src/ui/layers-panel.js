// Layers panel: layer selection with mute toggles, harmony-guard note,
// restore-starter-score link. Rows render from project.layers so custom
// layers appear alongside the defaults.
import { iconSvg } from "./icons.js";

export function initLayersPanel(store, actions) {
  const list = document.getElementById("layer-list");
  list.addEventListener("click", (event) => {
    const row = event.target.closest("button.layer-row");
    if (!row) return;
    if (event.target.closest(".mute-toggle")) {
      actions.toggleMute(row.dataset.track);
    } else {
      actions.selectTrack(row.dataset.track);
    }
  });
  document.getElementById("reset-project").addEventListener("click", actions.resetProject);

  // "More layer options" menu: add / rename / remove the selected layer.
  const menuButton = document.getElementById("layer-options-button");
  const menu = document.getElementById("layer-menu");
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    menu.hidden = !menu.hidden;
  });
  menu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-layer-action]");
    if (!item) return;
    menu.hidden = true;
    const action = item.dataset.layerAction;
    if (action === "add") actions.addLayer();
    if (action === "rename") actions.beginRenameLayer();
    if (action === "remove") actions.removeLayer(store.get().selectedTrack);
  });
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !event.target.closest("#layer-menu")) menu.hidden = true;
  });

  const guardText = document.getElementById("harmony-guard-text");
  const refineName = document.getElementById("refine-track-name");
  const dot = document.getElementById("selected-dot");

  function paint(project, selectedTrack) {
    const selected = project.layers.find((layer) => layer.id === selectedTrack) ?? project.layers[0];
    guardText.textContent = `Every note stays inside ${project.key} ${project.scale}.`;
    refineName.value = selected.name;
    dot.style.background = selected.color;
    dot.style.color = selected.color;
    renderRows(list, project, selected.id);
  }

  store.subscribe((changed) => {
    if (changed.includes("project") || changed.includes("selectedTrack")) {
      const { project, selectedTrack } = store.get();
      paint(project, selectedTrack);
    }
  });

  // Initial paint.
  const { project, selectedTrack } = store.get();
  paint(project, selectedTrack);
}

function renderRows(list, project, selectedTrack) {
  list.innerHTML = project.layers.map((layer) => `
    <button class="layer-row${selectedTrack === layer.id ? " selected" : ""}" data-track="${layer.id}">
      <span class="layer-color" style="background-color:${layer.color}"></span>
      <span class="layer-copy"><strong>${layer.name}</strong><small>${layer.detail}</small></span>
      <span class="mute-toggle" role="button" tabindex="0">${iconSvg(layer.muted ? "volume-x" : "volume-2", 14)}</span>
    </button>`).join("");
}
