// Reactive dynamics panel: live axis meters in the deck plus editors for the
// song-level reactive schema — per-context axis targets and the tempo.offset
// binding. Everything writes through updateProject so exports stay valid.
import { AXES } from "../music/default-project.js";

const AXIS_IDS = Object.keys(AXES);

export function initDynamicsPanel(store, actions) {
  const meters = document.getElementById("axis-meters");
  const targetsRoot = document.getElementById("context-targets");
  const tempoInput = document.getElementById("tempo-binding-input");
  const tempoValue = document.getElementById("tempo-binding-value");

  store.subscribe((changed) => {
    if (changed.includes("liveAxes")) renderMeters(meters, store.get().liveAxes);
    if (changed.includes("project")) paint(store.get().project);
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
  tempoInput.addEventListener("change", () => actions.setTempoBinding(Number(tempoInput.value)));
  tempoInput.addEventListener("input", () => paintSliderFill(tempoInput));

  // Initial paint.
  renderMeters(meters, store.get().liveAxes);
  paint(store.get().project);
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

function paint(project) {
  const targetsRoot = document.getElementById("context-targets");
  const tempoInput = document.getElementById("tempo-binding-input");
  const tempoValue = document.getElementById("tempo-binding-value");
  if (!targetsRoot || !tempoInput) return;

  targetsRoot.innerHTML = (project.contexts ?? []).map((ctx) => `
    <div class="target-row">
      <strong>${ctx.label}</strong>
      ${AXIS_IDS.map((axis) => `
        <label title="${ctx.label}: target ${AXES[axis].label.toLowerCase()}">
          <span>${AXES[axis].label.slice(0, 3)}</span>
          <input type="range" min="0" max="100" value="${Math.round((ctx.targets?.[axis] ?? 0.5) * 100)}" data-context="${ctx.id}" data-axis="${axis}" />
        </label>`).join("")}
    </div>`).join("");

  const binding = (project.bindings ?? []).find((item) => item.target === "tempo.offset");
  if (binding) {
    tempoInput.value = String(binding.domain[1]);
    tempoValue.textContent = `+${binding.domain[1]} BPM`;
    paintSliderFill(tempoInput);
  }
}

// Raw range inputs draw their accent fill via a --value custom property.
function paintSliderFill(input) {
  input.style.setProperty("--value", `${input.value}%`);
}
