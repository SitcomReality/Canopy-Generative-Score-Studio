// Phrase editor: renders the selected layer as an editable grid — scale-lane
// piano roll for degree layers, a beat lane for on/off layers — plus the
// song-level chord row. Fully re-rendered on project/step changes; the grid
// is small enough that wholesale rebuilds stay cheap.
import { SCALES } from "../music/scales.js";
import { midiToNote } from "../music/note-names.js";
import { chordLabel, scaleMidi } from "../music/scale-math.js";
import { LAYER_ROLES } from "../music/default-project.js";

export function initSequencePanel(store, actions) {
  document.getElementById("compose-melody-button").addEventListener("click", actions.composeMelody);
  document.getElementById("sparser-button").addEventListener("click", actions.makeSparser);

  const roll = document.getElementById("piano-roll");
  roll.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-step]");
    if (!cell) return;
    const step = Number(cell.dataset.step);
    if (cell.classList.contains("note-cell")) actions.setDegreeStep(step, Number(cell.dataset.degree));
    else if (cell.classList.contains("beat-cell")) actions.toggleLayerStep(step);
  });

  store.subscribe((changed) => {
    if (changed.includes("project") || changed.includes("step") || changed.includes("playing") || changed.includes("selectedTrack")) {
      render(roll, store.get());
    }
  });
  render(roll, store.get());
}

export function selectedLayer(project, selectedTrack) {
  return project.layers.find((layer) => layer.id === selectedTrack) ?? project.layers[0];
}

function render(roll, state) {
  const { project, step, playing, selectedTrack } = state;
  const layer = selectedLayer(project, selectedTrack);
  const current = (s) => `${s === step && playing ? " current" : ""}${s % 4 === 0 ? " strong" : ""}`;

  const title = document.getElementById("sequence-title");
  const subtitle = document.getElementById("sequence-subtitle");
  if (title) title.textContent = layer.name;
  if (subtitle) {
    subtitle.textContent = LAYER_ROLES[layer.role].kind === "degrees"
      ? "Click lanes to place notes. The engine adds variation without leaving your scale."
      : "Click beats to place or remove hits for this layer.";
  }

  const heads = Array.from({ length: 16 }, (_, s) =>
    `<div class="step-head${current(s)}"><span>${s + 1}</span></div>`).join("");

  let rows = "";
  if (LAYER_ROLES[layer.role].kind === "degrees") {
    const scaleLength = SCALES[project.scale].length;
    const lanes = Array.from({ length: Math.min(8, scaleLength + 1) }, (_, index) => scaleLength - index);
    rows = lanes.map((degree) => {
      const note = midiToNote(scaleMidi(project, degree, 4));
      const label = `<div class="note-label${degree === 0 || degree === 7 ? " root" : ""}"><span>${note.replace(/[0-9]/g, "")}</span><small>${note.match(/[0-9]/)?.[0] ?? ""}</small></div>`;
      const cells = Array.from({ length: 16 }, (_, s) => {
        const active = layer.steps[s] === degree;
        return `<button class="note-cell${active ? " active" : ""}${current(s)}" data-step="${s}" data-degree="${degree}" aria-label="${active ? "Remove" : "Add"} ${note} at step ${s + 1}">${active ? "<span></span>" : ""}</button>`;
      }).join("");
      return `<div class="roll-row">${label}${cells}</div>`;
    }).join("");
  } else {
    const cells = Array.from({ length: 16 }, (_, s) => {
      const active = Boolean(layer.steps[s]);
      return `<button class="beat-cell${active ? " active" : ""}${current(s)}" data-step="${s}" aria-label="${active ? "Remove" : "Add"} hit at step ${s + 1}">${active ? "<span></span>" : ""}</button>`;
    }).join("");
    rows = `<div class="roll-row beat-row"><div class="note-label root"><span>${layer.name.toUpperCase().slice(0, 6)}</span></div>${cells}</div>`;
  }

  const chordCells = Array.from({ length: 16 }, (_, s) => {
    const degree = project.progression[Math.floor(s / 4)];
    return `<div class="automation-cell${current(s)}" data-step="${s}">${s % 4 === 0 ? `<span>${chordLabel(project, degree)}</span>` : ""}</div>`;
  }).join("");

  roll.innerHTML = `<div class="roll-corner"><span>NOTE</span></div>${heads}${rows}
    <div class="roll-row chord-row"><div class="automation-label"><span>CHORDS</span></div>${chordCells}</div>`;
}
