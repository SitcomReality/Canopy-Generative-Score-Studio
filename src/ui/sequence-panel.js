// Phrase editor: the piano roll grid (scale lanes × 16 steps), chord row and
// bass/rhythm automation rows. Fully re-rendered on project/step changes —
// the grid is small enough that wholesale rebuilds stay cheap.
import { SCALES } from "../music/scales.js";
import { midiToNote } from "../music/note-names.js";
import { chordLabel, scaleMidi } from "../music/scale-math.js";

export function initSequencePanel(store, actions) {
  document.getElementById("compose-melody-button").addEventListener("click", actions.composeMelody);
  document.getElementById("sparser-button").addEventListener("click", actions.makeSparser);

  const roll = document.getElementById("piano-roll");
  roll.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-step]");
    if (!cell) return;
    const step = Number(cell.dataset.step);
    if (cell.classList.contains("note-cell")) actions.setMelodyStep(step, Number(cell.dataset.degree));
    else if (cell.dataset.track) actions.toggleBooleanStep(cell.dataset.track, step);
  });

  store.subscribe((changed) => {
    if (changed.includes("project") || changed.includes("step") || changed.includes("playing")) {
      render(roll, store.get());
    }
  });
  render(roll, store.get());
}

function render(roll, state) {
  const { project, step, playing } = state;
  const current = (s) => `${s === step && playing ? " current" : ""}${s % 4 === 0 ? " strong" : ""}`;

  const scaleLength = SCALES[project.scale].length;
  const lanes = Array.from({ length: Math.min(8, scaleLength + 1) }, (_, index) => scaleLength - index);

  const heads = Array.from({ length: 16 }, (_, s) =>
    `<div class="step-head${current(s)}"><span>${s + 1}</span></div>`).join("");

  const rows = lanes.map((degree) => {
    const note = midiToNote(scaleMidi(project, degree, 4));
    const label = `<div class="note-label${degree === 0 || degree === 7 ? " root" : ""}"><span>${note.replace(/[0-9]/g, "")}</span><small>${note.match(/[0-9]/)?.[0] ?? ""}</small></div>`;
    const cells = Array.from({ length: 16 }, (_, s) => {
      const active = project.melody[s] === degree;
      return `<button class="note-cell${active ? " active" : ""}${current(s)}" data-step="${s}" data-degree="${degree}" aria-label="${active ? "Remove" : "Add"} ${note} at step ${s + 1}">${active ? "<span></span>" : ""}</button>`;
    }).join("");
    return `<div class="roll-row">${label}${cells}</div>`;
  }).join("");

  const chordCells = Array.from({ length: 16 }, (_, s) => {
    const degree = project.progression[Math.floor(s / 4)];
    return `<div class="automation-cell${current(s)}" data-step="${s}">${s % 4 === 0 ? `<span>${chordLabel(project, degree)}</span>` : ""}</div>`;
  }).join("");

  const automationRows = ["bass", "percussion"].map((track) => {
    const label = `<div class="automation-label"><span>${track === "bass" ? "BASS" : "RHYTHM"}</span></div>`;
    const cells = project[track].map((active, s) =>
      `<button class="automation-cell${active ? " active" : ""}${current(s)}" data-step="${s}" data-track="${track}">${active ? "<i></i>" : ""}</button>`).join("");
    return `<div class="roll-row automation-row">${label}${cells}</div>`;
  }).join("");

  roll.innerHTML = `<div class="roll-corner"><span>NOTE</span></div>${heads}${rows}
    <div class="roll-row chord-row"><div class="automation-label"><span>CHORDS</span></div>${chordCells}</div>${automationRows}`;
}
