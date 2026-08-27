// Shared atmosphere panel (song-bar): the six global atmosphere params with an
// inline bindings editor. Each param keeps its base slider (the song's static
// baseline) and exposes a "Bind" affordance — toggle it and pick a driving axis
// + a domain (low→high) to turn that param into a song-level binding of the
// reactive axes, resolved live at each bar boundary. The bank-tag is "Score"
// because these are authored song settings, not a live/room texture.
import { AXES } from "../music/default-project.js";
import { ATMOSPHERE_TARGETS } from "../music/dynamics.js";
import { createParameterSlider } from "./parameter-slider.js";

const AXIS_IDS = Object.keys(AXES);
const AXIS_LABELS = { intensity: "Intensity", tension: "Tension", brightness: "Brightness" };

// The six atmosphere params. `bind` is the setBinding target; `space` marks the
// per-role sends whose binding domain is 0..1 (we edit it as a 0..100 percent,
// the same scale as the slider, and convert at the data boundary).
const PARAMS = [
  { key: "reverb", label: "Room", low: "Close", high: "Vast", target: "reverb", space: false },
  { key: "lead", label: "Lead", low: "Tight", high: "Wide", target: "space.lead", space: true },
  { key: "bed", label: "Bed", low: "Tight", high: "Wide", target: "space.bed", space: true },
  { key: "bass", label: "Bass", low: "Tight", high: "Wide", target: "space.bass", space: true },
  { key: "echo", label: "Echo", low: "Close", high: "Trailing", target: "space.echo", space: true },
  { key: "swing", label: "Sway", low: "Straight", high: "Sway", target: "swing", space: false },
];

export function initAtmospherePanel(store, actions) {
  const root = document.getElementById("shared-atmosphere-panel");
  if (!root) return;

  root.innerHTML = PARAMS.map((param) => `
    <div class="atmosphere-row" data-target="${param.target}">
      <div class="atmosphere-slider" data-slider="${param.target}"></div>
      <div class="atmosphere-bind" data-bind="${param.target}"></div>
    </div>`).join("");

  // The base sliders (static baselines for each param).
  const sliders = {};
  for (const param of PARAMS) {
    const sliderEl = root.querySelector(`[data-slider="${param.target}"]`);
    sliders[param.target] = createParameterSlider(sliderEl, {
      label: param.label,
      low: param.low,
      high: param.high,
      onChange: (value) => {
        if (param.space) actions.setSpace({ [param.key]: value / 100 });
        else actions.setParameter(param.key === "swing" ? "swing" : param.key, value);
      },
    });
  }

  // Bind editor: either a "Bind" button or, when bound, the axis + domain inputs.
  function paintBind(param, binding) {
    const el = root.querySelector(`[data-bind="${param.target}"]`);
    if (!binding) {
      el.innerHTML = `<button type="button" class="bind-toggle" data-target="${param.target}"><i data-icon="zap" data-size="12"></i> Bind</button>`;
      return;
    }
    const scale = param.space ? 100 : 1;
    const low = Math.round((Number(binding.domain[0]) || 0) * scale);
    const high = Math.round((Number(binding.domain[1]) || 100) * scale);
    el.innerHTML = `
      <select class="bind-axis" data-target="${param.target}" title="Which axis drives ${param.label.toLowerCase()}">
        ${AXIS_IDS.map((axis) => `<option value="${axis}"${binding.axis === axis ? " selected" : ""}>${AXIS_LABELS[axis].slice(0, 3).toUpperCase()}</option>`).join("")}
      </select>
      <input class="bind-domain-low" data-target="${param.target}" type="number" min="0" max="100" value="${low}" title="Low end of the mapped range" />
      <span class="bind-arrow">→</span>
      <input class="bind-domain-high" data-target="${param.target}" type="number" min="0" max="100" value="${high}" title="High end of the mapped range" />
      <button type="button" class="bind-remove" data-target="${param.target}" title="Remove this binding"><i data-icon="x" data-size="12"></i></button>`;
  }

  function readBinding(input) {
    const target = input.dataset.target;
    const param = PARAMS.find((p) => p.target === target);
    const binding = (store.get().project.bindings ?? []).find((b) => b.target === target);
    const axis = root.querySelector(`[data-bind="${target}"] .bind-axis`)?.value ?? binding?.axis ?? "intensity";
    const low = Number(root.querySelector(`[data-bind="${target}"] .bind-domain-low`)?.value ?? 0);
    const high = Number(root.querySelector(`[data-bind="${target}"] .bind-domain-high`)?.value ?? 100);
    const scale = param.space ? 100 : 1;
    return { axis, domain: [Math.min(low, high) / scale, Math.max(low, high) / scale] };
  }

  root.addEventListener("click", (event) => {
    const bindBtn = event.target.closest(".bind-toggle");
    if (bindBtn) {
      // Default a fresh binding to a sensible domain for the param.
      const param = PARAMS.find((p) => p.target === bindBtn.dataset.target);
      const low = param.space ? 20 : 30;
      const high = param.space ? 80 : 80;
      actions.setBinding(param.target, { axis: "intensity", domain: [low / (param.space ? 100 : 1), high / (param.space ? 100 : 1)] });
      return;
    }
    const remove = event.target.closest(".bind-remove");
    if (remove) {
      actions.setBinding(remove.dataset.target, null);
      return;
    }
  });

  root.addEventListener("change", (event) => {
    const input = event.target.closest("[data-target]");
    if (!input || input.classList.contains("bind-toggle") || input.classList.contains("bind-remove")) return;
    actions.setBinding(input.dataset.target, readBinding(input));
  });

  function paint() {
    const project = store.get().project;
    // Base slider values.
    sliders["reverb"].set(project.reverb ?? 0);
    sliders["swing"].set(project.swing ?? 0);
    for (const param of PARAMS.filter((p) => p.space)) {
      sliders[param.target].set(Math.round((project.space?.[param.key] ?? 0) * 100));
    }
    // Each target's current binding (from project.bindings).
    for (const param of PARAMS) {
      const binding = (project.bindings ?? []).find((b) => b.target === param.target);
      paintBind(param, binding);
    }
  }

  store.subscribe((changed) => {
    if (changed.includes("project")) paint();
  });

  paint();
  void ATMOSPHERE_TARGETS; // targets come from PARAMS; kept for parity/documentation
}
