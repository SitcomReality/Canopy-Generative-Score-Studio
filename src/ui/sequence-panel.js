// Phrase editor: renders the selected layer as an editable grid — scale-lane
// piano roll for degree layers, a beat lane for on/off layers — plus the
// song-level chord row. The grid rebuilds only on content changes (project,
// selection, drifted phrases); the per-step playhead is a cheap class toggle
// so playback never triggers wholesale DOM rebuilds on the scheduler's thread.
import { SCALES } from "../music/scales.js";
import { midiToNote } from "../music/note-names.js";
import { chordLabel, scaleMidi } from "../music/scale-math.js";
import { LAYER_ROLES } from "../music/default-project.js";
import { renderOn } from "./render-batch.js";

export function initSequencePanel(store, actions) {
  const composeButton = document.getElementById("compose-melody-button");
  const composeMenu = document.getElementById("compose-menu");
  composeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    composeMenu.hidden = !composeMenu.hidden;
  });
  composeMenu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-compose]");
    if (!item) return;
    composeMenu.hidden = true;
    actions.composeLayers(item.dataset.compose);
  });
  document.addEventListener("click", (event) => {
    if (!composeMenu.hidden && !event.target.closest(".compose-menu-anchor")) composeMenu.hidden = true;
  });
  document.getElementById("sparser-button").addEventListener("click", actions.makeSparser);

  const roll = document.getElementById("piano-roll");
  roll.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-step]");
    if (!cell) return;
    const step = Number(cell.dataset.step);
    if (cell.classList.contains("note-cell")) actions.setDegreeStep(step, Number(cell.dataset.degree));
    else if (cell.classList.contains("beat-cell")) actions.toggleLayerStep(step);
  });

  renderOn(store, ["project", "selectedTrack", "playing", "perfSteps"], () => {
    render(roll, store.get());
    updatePlayhead(roll, store.get());
  });
  // Step advances only move the playhead marker.
  renderOn(store, ["step"], () => updatePlayhead(roll, store.get()));
  render(roll, store.get());
  updatePlayhead(roll, store.get());
}

export function selectedLayer(project, selectedTrack) {
  return project.layers.find((layer) => layer.id === selectedTrack) ?? project.layers[0];
}

function render(roll, state) {
  const { project, playing, selectedTrack } = state;
  const layer = selectedLayer(project, selectedTrack);

  const title = document.getElementById("sequence-title");
  const subtitle = document.getElementById("sequence-subtitle");
  if (title) title.textContent = layer.name;
  if (subtitle) {
    subtitle.textContent = LAYER_ROLES[layer.role].kind === "degrees"
      ? "Click lanes to place notes. The engine adds variation without leaving your scale."
      : "Click beats to place or remove hits for this layer.";
  }

  let laneCount = 1;
  let rows = "";
  if (LAYER_ROLES[layer.role].kind === "degrees") {
    const scaleLength = SCALES[project.scale].length;
    const lanes = Array.from({ length: Math.min(8, scaleLength + 1) }, (_, index) => scaleLength - index);
    laneCount = lanes.length;
    rows = lanes.map((degree) => {
      const note = midiToNote(scaleMidi(project, degree, 4));
      const label = `<div class="note-label${degree === 0 || degree === 7 ? " root" : ""}"><span>${note.replace(/[0-9]/g, "")}</span><small>${note.match(/[0-9]/)?.[0] ?? ""}</small></div>`;
      const perf = state.perfSteps?.[layer.id];
      const cells = Array.from({ length: 16 }, (_, s) => {
        // Ghost cells show where generated variation sounds this pass but
        // nothing is written (the "Generated variation" legend swatch).
        const active = layer.steps[s] === degree;
        const ghost = !active && perf && perf[s] === degree;
        return `<button class="note-cell${active ? " active" : ""}${ghost ? " ghost" : ""}${s % 4 === 0 ? " strong" : ""}" data-step="${s}" data-degree="${degree}" aria-label="${active ? "Remove" : "Add"} ${note} at step ${s + 1}">${active || ghost ? "<span></span>" : ""}</button>`;
      }).join("");
      return `<div class="roll-row">${label}${cells}</div>`;
    }).join("");
  } else {
    const cells = Array.from({ length: 16 }, (_, s) => {
      const active = Boolean(layer.steps[s]);
      return `<button class="beat-cell${active ? " active" : ""}${s % 4 === 0 ? " strong" : ""}" data-step="${s}" aria-label="${active ? "Remove" : "Add"} hit at step ${s + 1}">${active ? "<span></span>" : ""}</button>`;
    }).join("");
    rows = `<div class="roll-row beat-row"><div class="note-label root"><span>${layer.name.toUpperCase().slice(0, 6)}</span></div>${cells}</div>`;
  }

  const chordCells = Array.from({ length: 16 }, (_, s) => {
    const degree = project.progression[Math.floor(s / 4)];
    return `<div class="automation-cell${s % 4 === 0 ? " strong" : ""}" data-step="${s}">${s % 4 === 0 ? `<span>${chordLabel(project, degree)}</span>` : ""}</div>`;
  }).join("");

  const heads = Array.from({ length: 16 }, (_, s) =>
    `<div class="step-head${s % 4 === 0 ? " strong" : ""}" data-step="${s}"><span>${s + 1}</span></div>`).join("");
  // Lanes stretch to fill the editor height; the count drives the row template.
  roll.style.setProperty("--lanes", String(laneCount));
  roll.innerHTML = `<div class="roll-corner"><span>NOTE</span></div>${heads}${rows}
    <div class="roll-row chord-row"><div class="automation-label"><span>CHORDS</span></div>${chordCells}</div>`;

  // Per-layer compose targets: one menu row per layer.
  const menu = document.getElementById("compose-menu");
  const perLayer = menu.querySelectorAll("[data-compose-layer]");
  perLayer.forEach((node) => node.remove());
  project.layers.forEach((entry) => {
    const item = document.createElement("button");
    item.dataset.composeLayer = entry.id;
    item.textContent = entry.name;
    menu.appendChild(item);
  });
}

// Playhead: toggle the .current class on every timed cell instead of
// re-rendering the grid each step.
function updatePlayhead(roll, state) {
  const { step, playing } = state;
  roll.querySelectorAll("[data-step]").forEach((cell) => {
    cell.classList.toggle("current", playing && Number(cell.dataset.step) === step);
  });
}
