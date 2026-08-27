// Flourish editor: edit the song's one-shot flourishes (v5). project.flourishes
// is name -> [{ degree, octave, at, dur, vel }], or null to use the built-in
// catalog. This shows each flourish's events (built-in when not customized),
// lets you add/remove/re-tune them, and reset back to the preset.
import { FLOURISH_NAMES, flourishEvents } from "../music/dynamics.js";

export function initFlourishEditor(store, actions) {
  const modal = document.getElementById("flourish-modal");
  const root = document.getElementById("flourish-editor");
  const openButton = document.getElementById("edit-flourishes-button");
  const closeButton = document.getElementById("flourish-modal-close");
  if (!modal || !root || !openButton) return;

  openButton.addEventListener("click", () => { modal.hidden = false; });
  closeButton?.addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (event) => { if (event.target === modal) modal.hidden = true; });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) modal.hidden = true;
  });

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-flourish-reset]")) {
      actions.resetFlourish(root.dataset.flourish);
      return;
    }
    if (event.target.closest("[data-flourish-add]")) {
      actions.addFlourishEvent(root.dataset.flourish);
      return;
    }
    const remove = event.target.closest("[data-flourish-remove-event]");
    if (remove) {
      actions.removeFlourishEvent(root.dataset.flourish, Number(remove.dataset.flourishRemoveEvent));
    }
  });

  root.addEventListener("change", (event) => {
    const nameSelect = event.target.closest("[data-flourish-name]");
    if (nameSelect) {
      root.dataset.flourish = nameSelect.value;
      render(root, store.get().project);
      return;
    }
    const field = event.target.closest("[data-ev-field]");
    if (field) {
      actions.updateFlourishEvent(root.dataset.flourish, Number(field.dataset.ev), { [field.dataset.evField]: Number(field.value) });
    }
  });

  store.subscribe((changed) => {
    if (changed.includes("project")) render(root, store.get().project);
  });

  root.dataset.flourish = "victory";
  render(root, store.get().project);
}

function render(root, project) {
  const name = root.dataset.flourish || "victory";
  const customized = Boolean(project.flourishes?.[name]);
  const events = flourishEvents(project, name);
  root.innerHTML = `
    <div class="flourish-head">
      <label class="flourish-name-field">Flourish
        <select data-flourish-name>${FLOURISH_NAMES.map((n) => `<option value="${n}"${n === name ? " selected" : ""}>${n}</option>`).join("")}</select>
      </label>
      <span class="flourish-custom${customized ? " on" : ""}">${customized ? "Customized" : "Built-in preset"}</span>
    </div>
    <div class="flourish-events">
      ${events.length === 0 ? `<p class="inst-empty">No events — this flourish is silent.</p>` : events.map((ev, i) => `
        <div class="flourish-event">
          <label>Degree<input type="number" min="0" max="7" step="1" value="${ev.degree}" data-ev="${i}" data-ev-field="degree" /></label>
          <label>Octave<input type="number" min="1" max="7" step="1" value="${ev.octave}" data-ev="${i}" data-ev-field="octave" /></label>
          <label>At<input type="number" min="0" max="3.75" step="0.05" value="${ev.at}" data-ev="${i}" data-ev-field="at" /></label>
          <label>Dur<input type="number" min="0.05" max="4" step="0.05" value="${ev.dur}" data-ev="${i}" data-ev-field="dur" /></label>
          <label>Vel<input type="number" min="0.05" max="1" step="0.05" value="${ev.vel}" data-ev="${i}" data-ev-field="vel" /></label>
          <button class="fill-remove" data-flourish-remove-event="${i}" aria-label="Remove event"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>`).join("")}
    </div>
    <div class="flourish-actions">
      <button class="event-button" data-flourish-add>+ Add event</button>
      <button class="reset-link" data-flourish-reset><i data-icon="rotate-ccw" data-size="13"></i> Reset to built-in</button>
    </div>`;
}
