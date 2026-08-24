// Layers panel: track selection with mute toggles, harmony-guard note,
// restore-starter-score link.
import { TRACKS } from "../music/tracks.js";
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

  store.subscribe((changed) => {
    const { project, selectedTrack } = store.get();
    if (changed.includes("project")) {
      document.getElementById("harmony-guard-text").textContent = `Every note stays inside ${project.key} ${project.scale}.`;
      renderRows(list, project, selectedTrack);
    }
    if (changed.includes("selectedTrack")) {
      renderRows(list, project, selectedTrack);
      document.getElementById("refine-track-name").textContent = TRACKS.find((track) => track.id === selectedTrack).name;
      const dot = document.getElementById("selected-dot");
      dot.style.background = TRACKS.find((track) => track.id === selectedTrack).color;
      dot.style.color = TRACKS.find((track) => track.id === selectedTrack).color;
    }
  });

  // Initial paint.
  const { project, selectedTrack } = store.get();
  document.getElementById("harmony-guard-text").textContent = `Every note stays inside ${project.key} ${project.scale}.`;
  renderRows(list, project, selectedTrack);
  document.getElementById("refine-track-name").textContent = TRACKS.find((track) => track.id === selectedTrack).name;
}

function renderRows(list, project, selectedTrack) {
  list.innerHTML = TRACKS.map((track) => `
    <button class="layer-row${selectedTrack === track.id ? " selected" : ""}" data-track="${track.id}">
      <span class="layer-color" style="background-color:${track.color}"></span>
      <span class="layer-copy"><strong>${track.name}</strong><small>${track.detail}</small></span>
      <span class="mute-toggle" role="button" tabindex="0">${iconSvg(project.muted[track.id] ? "volume-x" : "volume-2", 14)}</span>
    </button>`).join("");
}
