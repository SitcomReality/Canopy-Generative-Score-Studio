// Layers panel: one div-based row per layer with inline role and instrument
// selects, a mute toggle, harmony-guard note, and restore-starter-score link.
// Rows render from project.layers so custom layers appear alongside the
// defaults. Selects stop propagation so editing them never selects the row.
import { iconSvg } from "./icons.js";
import { LAYER_ROLES, ROLE_COLORS } from "../music/default-project.js";
import { INSTRUMENT_NAMES } from "../music/instruments.js";

export function initLayersPanel(store, actions) {
  const list = document.getElementById("layer-list");
  list.addEventListener("click", (event) => {
    const row = event.target.closest(".layer-row");
    if (!row || event.target.closest("select")) return;
    if (event.target.closest(".mute-toggle")) {
      actions.toggleMute(row.dataset.track);
    } else {
      actions.selectTrack(row.dataset.track);
    }
  });
  list.addEventListener("change", (event) => {
    const row = event.target.closest(".layer-row");
    if (!row) return;
    if (event.target.classList.contains("role-select")) actions.setLayerRole(row.dataset.track, event.target.value);
    if (event.target.classList.contains("instrument-select")) actions.setInstrument(row.dataset.track, event.target.value);
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
    dot.style.background = ROLE_COLORS[selected.role];
    dot.style.color = ROLE_COLORS[selected.role];
    renderRows(list, project, selected.id);
  }

  store.subscribe((changed) => {
    if (changed.includes("project") || changed.includes("selectedTrack")) {
      const { project, selectedTrack } = store.get();
      paint(project, selectedTrack);
      paintSounding(store.get().sounding);
    }
    // Live "sounding now" glow on rows whose layer triggered this step.
    if (changed.includes("sounding")) paintSounding(store.get().sounding);
  });

  function paintSounding(soundingIds) {
    const sounding = new Set(soundingIds ?? []);
    list.querySelectorAll(".layer-row").forEach((row) => {
      const dot = row.querySelector(".layer-color");
      const on = sounding.has(row.dataset.track);
      row.classList.toggle("sounding", on);
      if (dot) dot.style.boxShadow = on ? `0 0 9px 1px ${dot.style.backgroundColor}` : "";
    });
  }

  // Initial paint.
  const { project, selectedTrack } = store.get();
  paint(project, selectedTrack);
}

function renderRows(list, project, selectedTrack) {
  list.innerHTML = project.layers.map((layer) => `
    <div class="layer-row${selectedTrack === layer.id ? " selected" : ""}" data-track="${layer.id}">
      <span class="layer-color" style="background-color:${ROLE_COLORS[layer.role]}"></span>
      <span class="layer-copy"><strong>${layer.name}</strong><small>${layer.instrument}</small></span>
      <select class="role-select" aria-label="${layer.name} role" title="What this layer does">
        ${Object.entries(LAYER_ROLES).map(([value, def]) =>
          `<option value="${value}"${value === layer.role ? " selected" : ""}>${def.label}</option>`).join("")}
      </select>
      <select class="instrument-select" aria-label="${layer.name} instrument" title="How this layer sounds">
        ${INSTRUMENT_NAMES.map((name) =>
          `<option${name === layer.instrument ? " selected" : ""}>${name}</option>`).join("")}
      </select>
      <span class="mute-toggle" role="button" tabindex="0">${iconSvg(layer.muted ? "volume-x" : "volume-2", 14)}</span>
    </div>`).join("");
}
