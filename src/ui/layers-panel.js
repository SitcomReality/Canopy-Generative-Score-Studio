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

  const guardText = document.getElementById("harmony-guard-text");
  const refineName = document.getElementById("refine-track-name");
  const dot = document.getElementById("selected-dot");

  function paint(project, selectedTrack) {
    const selected = project.layers.find((layer) => layer.id === selectedTrack) ?? project.layers[0];
    guardText.textContent = `Every note stays inside ${project.key} ${project.scale}.`;
    refineName.textContent = selected.name;
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
