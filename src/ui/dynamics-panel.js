// Reactive dynamics panel: live axis meters in the deck plus editors for the
// song-level reactive schema — per-context axis targets and v5 verses.
// Everything writes through updateProject so exports stay valid.
import { AXES } from "../music/default-project.js";

const AXIS_IDS = Object.keys(AXES);

export function initDynamicsPanel(store, actions) {
  const meters = document.getElementById("axis-meters");
  const targetsRoot = document.getElementById("context-targets");
  const verseRoot = document.getElementById("verse-editor");
  const stripRoot = document.getElementById("structure-strip");
  const modal = document.getElementById("structure-modal");

  // The full verse editor lives in a modal so the song bar stays short and
  // never squeezes the piano roll; the compact structure strip is always
  // visible and opens the modal on click.
  const editButton = document.getElementById("verse-edit-button");
  const closeButton = document.getElementById("structure-modal-close");
  editButton?.addEventListener("click", () => { if (modal) modal.hidden = false; });
  closeButton?.addEventListener("click", () => { if (modal) modal.hidden = true; });
  stripRoot?.addEventListener("click", () => { if (modal) modal.hidden = false; });
  modal?.addEventListener("click", (event) => { if (event.target === modal) modal.hidden = true; });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) modal.hidden = true;
  });

  store.subscribe((changed) => {
    if (changed.includes("liveAxes")) renderMeters(meters, store.get().liveAxes);
    if (changed.includes("project")) paint(store.get().project, store.get().sectionId);
    if (changed.includes("sectionId")) paintVersePlayhead(verseRoot, store.get().sectionId);
  });

  targetsRoot.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-context]");
    if (!input) return;
    actions.setContextTarget(input.dataset.context, input.dataset.axis, Number(input.value) / 100);
  });
  targetsRoot.addEventListener("input", (event) => {
    const input = event.target.closest("input[data-context]");
    if (input) paintSliderFill(input);
  });

  verseRoot.addEventListener("change", (event) => onVerseChange(event, verseRoot, store, actions));
  verseRoot.addEventListener("click", (event) => {
    const remove = event.target.closest("button[data-remove]");
    if (remove) {
      const sections = readSections(verseRoot).filter((_, index) => index !== Number(remove.dataset.remove));
      actions.setSections(sanitizeSectionsInput(sections));
      return;
    }
    const toggle = event.target.closest("button[data-layer]");
    if (!toggle) return;
    onVerseToggle(toggle, verseRoot, store, actions);
  });
  document.getElementById("verse-add").addEventListener("click", () => {
    const sections = readSections(verseRoot);
    sections.push({ id: `verse-${sections.length + 1}`, label: `Verse ${sections.length + 1}`, length: 4, layers: {} });
    actions.setSections(sanitizeSectionsInput(sections));
  });
  document.getElementById("verse-clear").addEventListener("click", () => actions.setSections([]));

  // Initial paint.
  renderMeters(meters, store.get().liveAxes);
  paint(store.get().project, store.get().sectionId);
}

function renderMeters(root, liveAxes) {
  root.innerHTML = AXIS_IDS.map((id) => {
    const pct = Math.round(Math.max(0, Math.min(1, liveAxes?.[id] ?? 0)) * 100);
    return `<span class="axis-meter" title="${AXES[id].label} (live)">
      <small>${AXES[id].label.slice(0, 3)}</small>
      <span class="axis-track"><i style="width:${pct}%"></i></span>
    </span>`;
  }).join("");
}

function paint(project, sectionId = null) {
  const targetsRoot = document.getElementById("context-targets");
  const verseRoot = document.getElementById("verse-editor");
  if (!targetsRoot || !verseRoot) return;

  targetsRoot.innerHTML = (project.contexts ?? []).map((ctx) => `
    <div class="target-row">
      <strong>${ctx.label}</strong>
      ${AXIS_IDS.map((axis) => `
        <label title="${ctx.label}: target ${AXES[axis].label.toLowerCase()}">
          <span>${AXES[axis].label.slice(0, 3)}</span>
          <input type="range" min="0" max="100" value="${Math.round((ctx.targets?.[axis] ?? 0.5) * 100)}" data-context="${ctx.id}" data-axis="${axis}" />
        </label>`).join("")}
    </div>`).join("");

  const layerIds = (project.layers ?? []).map((layer) => ({ id: layer.id, name: layer.name }));
  verseRoot.innerHTML = (project.sections ?? []).map((section, index) => `
    <div class="verse-row${sectionId === section.id ? " playing" : ""}" data-index="${index}" data-id="${section.id}">
      <input class="verse-label" value="${section.label}" title="Verse name" data-field="label" />
      <select data-field="length" title="Length in bars">
        ${[1, 2, 4, 8].map((n) => `<option value="${n}"${section.length === n ? " selected" : ""}>${n} bar${n > 1 ? "s" : ""}</option>`).join("")}
      </select>
      ${layerIds.map(({ id, name }) => {
        const off = section.layers?.[id]?.active === false;
        return `<button type="button" class="verse-layer${off ? " off" : ""}" data-layer="${id}" title="${name}: click to ${off ? "bring into" : "drop out of"} this verse">${name.slice(0, 4)}</button>`;
      }).join("")}
      <button type="button" class="verse-remove" data-remove="${index}" title="Remove verse">×</button>
    </div>`).join("") || `<p class="binding-note">No verses — the song plays as one continuous arrangement.</p>`;

  renderStructureStrip(document.getElementById("structure-strip"), project, sectionId);
}

// Compact arrangement strip: one chip per section in a single row so the song
// bar stays short. Chips are informational — clicking one opens the modal.
function renderStructureStrip(root, project, sectionId) {
  if (!root) return;
  const sections = project.sections ?? [];
  if (sections.length === 0) {
    root.innerHTML = `<span class="structure-empty">Full song — no sections</span>`;
    return;
  }
  root.innerHTML = sections.map((section) => {
    const dropped = Object.values(section.layers ?? {}).some((override) => override.active === false);
    return `<button type="button" class="structure-chip${sectionId === section.id ? " playing" : ""}" data-section="${section.id}"
      title="${dropped ? "Some layers dropped in this verse" : "Full arrangement"} — ${section.length} bar${section.length > 1 ? "s" : ""}">
      <span class="structure-chip-label">${section.label}</span>
      <span class="structure-chip-meta">${section.length}</span>
    </button>`;
  }).join("");
}

// Live playhead highlight for whichever verse is currently sounding.
function paintVersePlayhead(root, sectionId) {
  const active = Boolean(sectionId);
  if (root) {
    root.querySelectorAll(".verse-row").forEach((row) => {
      row.classList.toggle("playing", active && row.dataset.id === sectionId);
    });
  }
  const strip = document.getElementById("structure-strip");
  if (strip) {
    strip.querySelectorAll(".structure-chip").forEach((chip) => {
      chip.classList.toggle("playing", active && chip.dataset.section === sectionId);
    });
  }
}

// Rebuild the sections list from the editor DOM and write it back.
function readSections(root) {
  return [...root.querySelectorAll(".verse-row")].map((row, index) => ({
    id: row.dataset.id ?? `verse-${index + 1}`,
    label: row.querySelector('[data-field="label"]').value,
    length: Number(row.querySelector('[data-field="length"]').value),
    layers: Object.fromEntries(
      [...row.querySelectorAll("button[data-layer].off")].map((button) => [button.dataset.layer, { active: false }]),
    ),
  }));
}

// Light re-sanitization so ad-hoc edits can't corrupt the schema.
function sanitizeSectionsInput(sections) {
  return sections.map((section, index) => ({
    ...section,
    id: section.id || `verse-${index + 1}`,
    length: Math.max(1, Math.min(16, Math.round(Number(section.length) || 4))),
    layers: section.layers && typeof section.layers === "object" ? section.layers : {},
  }));
}

function commitVerses(verseRoot, store, actions) {
  const sections = readSections(verseRoot);
  actions.setSections(sanitizeSectionsInput(sections));
}

function onVerseChange(event, verseRoot, store, actions) {
  const row = event.target.closest(".verse-row");
  if (!row) return;
  if (event.target.dataset.field === "label" && !event.target.value.trim()) {
    event.target.value = `Verse ${Number(row.dataset.index) + 1}`;
  }
  commitVerses(verseRoot, store, actions);
}

function onVerseToggle(button, verseRoot, store, actions) {
  button.classList.toggle("off");
  commitVerses(verseRoot, store, actions);
}

// Raw range inputs draw their accent fill via a --value custom property.
function paintSliderFill(input) {
  input.style.setProperty("--value", `${input.value}%`);
}
