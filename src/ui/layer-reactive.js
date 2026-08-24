// Per-layer reactive editor for the selected layer: the activity gate
// (silence the layer outside an axis range), its fills (extra hits injected at
// chosen steps when an axis crosses a threshold — the drumroll-ish behavior),
// and a read-only summary of its automation mappings.
import { AXES } from "../music/default-project.js";

const AXIS_IDS = Object.keys(AXES);
const AXIS_LABEL = (id) => AXES[id]?.label ?? id;

export function initLayerReactive(store, actions) {
  const root = document.getElementById("layer-reactive");
  if (!root) return;

  root.addEventListener("change", (event) => {
    const { project, selectedTrack } = store.get();
    const layerId = selectedTrack;
    if (event.target.matches("[data-activity-axis]")) {
      const axis = event.target.value;
      actions.setLayerActivity(layerId, axis ? { axis, range: activityOf(project, layerId)?.range ?? [0.35, 1] } : null);
    }
    const bound = event.target.closest("[data-activity-range]");
    if (bound) {
      const current = activityOf(store.get().project, layerId);
      if (!current) return;
      const range = [...current.range];
      range[Number(bound.dataset.activityRange)] = Number(bound.value) / 100;
      actions.setLayerActivity(layerId, { ...current, range });
    }
    const threshold = event.target.closest("[data-fill-threshold]");
    if (threshold) {
      actions.updateFill(layerId, Number(threshold.dataset.fillThreshold), { threshold: Number(threshold.value) / 100 });
    }
    const fillAxis = event.target.closest("[data-fill-axis]");
    if (fillAxis) {
      actions.updateFill(layerId, Number(fillAxis.dataset.fillAxis), { axis: fillAxis.value });
    }
  });

  root.addEventListener("input", (event) => {
    const slider = event.target.closest('input[type="range"]');
    if (slider) slider.style.setProperty("--value", `${slider.value}%`);
  });

  root.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-fill-step]");    if (dot) {
      // Keep at least one step per fill; empty fills are dropped by hydration.
      const entry = fillAt(store.get().project, store.get().selectedTrack, Number(dot.dataset.fillIndex));
      if (entry && !(entry.at.length === 1 && entry.at.includes(Number(dot.dataset.fillStep)))) {
        actions.toggleFillStep(store.get().selectedTrack, Number(dot.dataset.fillIndex), Number(dot.dataset.fillStep));
      }
      return;
    }
    if (event.target.closest("[data-fill-remove]")) {
      actions.removeFill(store.get().selectedTrack, Number(event.target.closest("[data-fill-remove]").dataset.fillRemove));
    } else if (event.target.closest("#add-fill-button")) {
      actions.addFill(store.get().selectedTrack);
    }
  });

  store.subscribe((changed) => {
    if (changed.includes("project") || changed.includes("selectedTrack")) render(root, store.get());
  });
  render(root, store.get());
}

function activityOf(project, layerId) {
  return project.layers.find((layer) => layer.id === layerId)?.activity ?? null;
}

function fillAt(project, layerId, index) {
  return project.layers.find((layer) => layer.id === layerId)?.fills?.[index] ?? null;
}

function summarizeDomain(domain) {
  return domain.map((value) => (typeof value === "object" ? JSON.stringify(value) : String(value))).join(" → ");
}

function render(root, state) {
  const layer = state.project.layers.find((item) => item.id === state.selectedTrack) ?? state.project.layers[0];
  const activity = layer.activity ?? null;
  const fills = layer.fills ?? [];

  const activityHtml = `
    <div class="field-row" title="Silence this layer whenever the live axis falls outside the range below. The default percussion layer only enters above intensity 35%.">
      <span>Activity gate</span>
      <select data-activity-axis>
        <option value="">Always on</option>
        ${AXIS_IDS.map((id) => `<option value="${id}"${activity?.axis === id ? " selected" : ""}>by ${AXIS_LABEL(id)}</option>`).join("")}
      </select>
    </div>
    ${activity ? `
    <div class="gate-ranges">
      <label><span>from</span><input type="range" min="0" max="100" value="${Math.round(activity.range[0] * 100)}" data-activity-range="0" /></label>
      <label><span>to</span><input type="range" min="0" max="100" value="${Math.round(activity.range[1] * 100)}" data-activity-range="1" /></label>
    </div>` : ""}`;

  const fillsHtml = `
    <div class="reactive-heading">
      <span>Fills</span>
      <button id="add-fill-button" title="Add extra hits when an axis crosses a threshold">Add</button>
    </div>
    ${fills.length === 0 ? `<p class="reactive-empty">No fills — this layer never adds extra hits.</p>` : ""}
    ${fills.map((fill, index) => `
      <div class="fill-row">
        <div class="fill-meta">
          <select data-fill-axis="${index}" title="Which axis triggers this fill">
            ${AXIS_IDS.map((id) => `<option value="${id}"${fill.axis === id ? " selected" : ""}>${AXIS_LABEL(id)}</option>`).join("")}
          </select>
          <label title="Minimum live axis value for the extra hits to fire">
            <span>≥ ${Math.round(fill.threshold * 100)}%</span>
            <input type="range" min="0" max="100" value="${Math.round(fill.threshold * 100)}" data-fill-threshold="${index}" />
          </label>
          <button class="fill-remove" data-fill-remove="${index}" aria-label="Remove fill"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>
        <div class="fill-dots">
          ${Array.from({ length: 16 }, (_, step) => `
            <i class="${fill.at.includes(step) ? " on" : ""}" data-fill-step="${step}" data-fill-index="${index}" title="Step ${step + 1}"></i>`).join("")}
        </div>
      </div>`).join("")}`;
  const automationHtml = `
    <div class="reactive-heading"><span>Automation</span></div>
    ${(layer.automation ?? []).length === 0
      ? `<p class="reactive-empty">No automation mappings.</p>`
      : `<ul class="automation-chips">${layer.automation.map((entry) =>
          `<li title="${AXIS_LABEL(entry.axis)} drives ${entry.param} from ${summarizeDomain(entry.domain)}">${entry.param} ← ${AXIS_LABEL(entry.axis).toLowerCase()}</li>`).join("")}</ul>`}
    <p class="reactive-hint">Automation domains are edited in the exported JSON for now.</p>`;

  root.innerHTML = `
    <div class="reactive-heading"><span>Reactive</span></div>
    ${activityHtml}${fillsHtml}${automationHtml}`;
  root.querySelectorAll('input[type="range"]').forEach((slider) =>
    slider.style.setProperty("--value", `${slider.value}%`));
}
