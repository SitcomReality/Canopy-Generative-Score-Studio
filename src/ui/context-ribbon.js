// Context ribbon: live game-state label, context switcher, threat slider,
// one-shot flourish trigger. Context changes requested while playing are
// queued until the next bar boundary by the audio engine.
import { CONTEXTS } from "../music/contexts.js";
import { FLOURISH_NAMES } from "../music/dynamics.js";
import { iconSvg } from "./icons.js";

const FLOURISH_LABELS = {
  victory: "Victory",
  defeat: "Defeat",
  combat: "Combat enters",
  calm: "Calm dissipates",
  relief: "Relief",
  unease: "Unease",
};

export function initContextRibbon(store, actions) {
  const switcher = document.getElementById("context-switcher");
  switcher.innerHTML = CONTEXTS.map((item) => `
    <button class="context-option" data-context="${item.id}">
      ${iconSvg(item.icon, 15)}<span>${item.short}</span><i hidden></i>
    </button>`).join("");
  switcher.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-context]");
    if (button) actions.requestContext(button.dataset.context);
  });

  document.getElementById("threat-slider").addEventListener("input", (event) => actions.setThreat(Number(event.target.value)));
  const flourishSelect = document.getElementById("flourish-select");
  flourishSelect.innerHTML = FLOURISH_NAMES.map((name) => `<option value="${name}">${FLOURISH_LABELS[name] ?? name}</option>`).join("");
  document.getElementById("flourish-button").addEventListener("click", () => actions.queueFlourish(flourishSelect.value));

  store.subscribe((changed) => {
    const { currentContext, queuedContext, threat, flourishQueued } = store.get();
    if (changed.includes("currentContext") || changed.includes("queuedContext")) {
      const active = CONTEXTS.find((item) => item.id === currentContext);
      document.getElementById("context-status").textContent = queuedContext
        ? `Transitioning to ${CONTEXTS.find((item) => item.id === queuedContext)?.short.toLowerCase()} on next bar`
        : active.description;
      switcher.querySelectorAll("button[data-context]").forEach((button) => {
        const id = button.dataset.context;
        button.classList.toggle("active", currentContext === id);
        button.classList.toggle("queued", queuedContext === id);
        button.querySelector(".context-active-bg")?.remove();
        if (currentContext === id) {
          button.insertAdjacentHTML("afterbegin", '<span class="context-active-bg"></span>');
        }
        button.querySelector("i").hidden = queuedContext !== id;
      });
    }
    if (changed.includes("threat")) {
      const slider = document.getElementById("threat-slider");
      slider.value = String(threat);
      slider.style.setProperty("--value", `${threat}%`);
      document.getElementById("threat-value").textContent = `${threat}%`;
    }
    if (changed.includes("flourishQueued")) {
      const button = document.getElementById("flourish-button");
      const label = document.getElementById("flourish-label");
      button.classList.toggle("queued", Boolean(flourishQueued));
      label.textContent = flourishQueued
        ? `${FLOURISH_LABELS[flourishQueued] ?? flourishQueued} queued`
        : "Queue flourish";
    }
  });
}
