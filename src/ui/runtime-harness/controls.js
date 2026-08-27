// Harness control wiring: transport buttons and manual axis targets. Everyting
// funnels through the shared call() wrapper so failures surface as toasts and
// every API hit is logged.
export function wireControls({ els, call }) {
  els.start.addEventListener("click", () => call("startScore()", (m) => m.startScore()));
  els.stop.addEventListener("click", () => call("stopScore()", (m) => m.stopScore()));
  els.dispose.addEventListener("click", () => call("disposeScore()", (m) => m.disposeScore()));

  // Manual axis targets: send all three sliders as one setGameAxes call.
  const paintAxisFill = (input) => input.style.setProperty("--value", `${input.value}%`);
  const sendAxes = () => {
    const axes = {};
    els.axesOverride.querySelectorAll("input[data-harness-axis]").forEach((input) => {
      axes[input.dataset.harnessAxis] = Number(input.value) / 100;
      paintAxisFill(input);
    });
    call(`setGameAxes({ ${Object.entries(axes).map(([k, v]) => `${k}: ${v.toFixed(2)}`).join(", ")} })`,
      (m) => m.setGameAxes(axes));
  };
  els.axesOverride.addEventListener("input", sendAxes);
  els.axesClear.addEventListener("click", () => {
    call("setGameAxes(null)", (m) => m.setGameAxes(null));
  });
}
