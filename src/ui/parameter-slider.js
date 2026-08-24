// Labeled range slider used across the refine panel. Returns markup and a
// sync function so the view can refresh value/label/fill without rebuilding
// while the user drags.
export function createParameterSlider(container, { label, low, high, onChange }) {
  container.innerHTML = `
    <label class="parameter-slider" title="${low} to ${high}">
      <span><strong>${label}</strong><b></b></span>
      <input type="range" min="0" max="100" />
    </label>`;
  const input = container.querySelector("input");
  const readout = container.querySelector("b");
  input.addEventListener("input", () => onChange(Number(input.value)));
  return {
    set(value) {
      input.value = String(value);
      readout.textContent = `${value}%`;
      input.style.setProperty("--value", `${value}%`);
    },
  };
}
