// Axis control (deck-live): the three reactive axes as target sliders plus a
// live-value readout. This is the studio equivalent of a game's setGameAxes
// call — dragging a slider steers the axis the sequencer eases liveAxes toward
// at each bar boundary, so you can hear the music react without touching the
// Runtime page. The readout (small % next to each slider) shows the current
// live value, converging on the slider as it eases in.
import { AXES } from "../music/default-project.js";

const AXIS_IDS = Object.keys(AXES);

export function initAxisControl(store, actions) {
  const root = document.getElementById("axis-control");
  if (!root) return;

  // One slider per axis, bound to the store's targetAxes.
  root.innerHTML = AXIS_IDS.map((axis) => {
    const label = AXES[axis].label;
    return `
      <label class="axis-slider" title="${label} — target (drag to steer); the % readout is the live value">
        <span class="axis-slider-label">${label.slice(0, 3).toUpperCase()}</span>
        <input type="range" min="0" max="100" value="30" data-axis="${axis}" />
        <span class="axis-live" data-live="${axis}">30%</span>
      </label>`;
  }).join("");

  root.addEventListener("input", (event) => {
    const input = event.target.closest("input[data-axis]");
    if (!input) return;
    paintFill(input);
    actions.setAxisTarget(input.dataset.axis, Number(input.value) / 100);
  });

  store.subscribe((changed) => {
    const { targetAxes, liveAxes } = store.get();
    if (changed.includes("targetAxes")) {
      root.querySelectorAll("input[data-axis]").forEach((input) => {
        const value = Math.round((targetAxes?.[input.dataset.axis] ?? 0.5) * 100);
        input.value = String(value);
        paintFill(input);
      });
    }
    if (changed.includes("liveAxes")) {
      root.querySelectorAll("[data-live]").forEach((el) => {
        const value = Math.round(Math.max(0, Math.min(1, liveAxes?.[el.dataset.live] ?? 0)) * 100);
        el.textContent = `${value}%`;
        el.classList.toggle("settled", Math.abs((targetAxes?.[el.dataset.live] ?? 0.5) - (liveAxes?.[el.dataset.live] ?? 0)) < 0.001);
      });
    }
  });

  // Initial paint.
  const { targetAxes, liveAxes } = store.get();
  root.querySelectorAll("input[data-axis]").forEach((input) => {
    input.value = String(Math.round((targetAxes?.[input.dataset.axis] ?? 0.5) * 100));
    paintFill(input);
  });
  root.querySelectorAll("[data-live]").forEach((el) => {
    el.textContent = `${Math.round((liveAxes?.[el.dataset.live] ?? 0) * 100)}%`;
  });
}

function paintFill(input) {
  input.style.setProperty("--value", `${input.value}%`);
}
