// Harness control wiring: transport buttons, game-state sliders, flourish
// buttons and manual axis overrides. Everything funnels through the shared
// call() wrapper so failures surface as toasts and every API hit is logged.
import { FLOURISH_NAMES } from "../../music/dynamics.js";

export function wireControls({ els, call }) {
  els.start.addEventListener("click", () => call("startScore()", (m) => m.startScore()));
  els.stop.addEventListener("click", () => call("stopScore()", (m) => m.stopScore()));
  els.dispose.addEventListener("click", () => call("disposeScore()", (m) => m.disposeScore()));

  const sendState = () => {
    const threat = Number(els.threat.value) / 100;
    els.threatValue.textContent = `${els.threat.value}%`;
    els.threat.style.setProperty("--value", `${els.threat.value}%`);
    call(`setGameMusicState({ threat: ${threat.toFixed(2)}, inCombat: ${els.combat.checked} })`,
      (m) => m.setGameMusicState({ threat, inCombat: els.combat.checked }));
  };
  els.threat.addEventListener("input", sendState);
  els.combat.addEventListener("change", sendState);

  els.flourishes.innerHTML = FLOURISH_NAMES.map((name) =>
    `<button type="button" class="event-button" data-flourish="${name}">${name}</button>`).join("");
  els.flourishes.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-flourish]");
    if (!button) return;
    call(`musicEvent("${button.dataset.flourish}")`, (m) => m.musicEvent(button.dataset.flourish));
  });

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
