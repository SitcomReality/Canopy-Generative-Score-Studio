// Runtime view: event lab (orbit core + game-event buttons) and the
// implementation panel (integration snippet, runtime download).
import { CONTEXTS } from "../music/contexts.js";
import { safeFileName } from "../utils/download.js";
import { iconSvg } from "./icons.js";

export function initRuntimeView(store, actions) {
  document.querySelectorAll("#view-runtime .event-actions button[data-context]").forEach((button) => {
    button.addEventListener("click", () => actions.requestContext(button.dataset.context));
  });
  document.getElementById("runtime-victory").addEventListener("click", actions.queueVictory);
  document.getElementById("runtime-play").addEventListener("click", actions.togglePlayback);

  const installLine = "npm install tone";
  document.getElementById("copy-install").addEventListener("click", () => navigator.clipboard.writeText(installLine));

  document.getElementById("copy-snippet").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById("integration-snippet").textContent);
    document.getElementById("copy-snippet-label").textContent = "Copied";
    window.setTimeout(() => {
      document.getElementById("copy-snippet-label").textContent = "Copy";
    }, 1800);
  });

  document.getElementById("download-runtime").addEventListener("click", actions.exportRuntime);

  store.subscribe((changed) => {
    const { project, currentContext, playing } = store.get();
    if (changed.includes("project")) {
      document.getElementById("integration-snippet").textContent = integrationSnippet(project.name);
      document.getElementById("download-runtime-label").textContent = `Download ${safeFileName(project.name)}.score.js`;
    }
    if (changed.includes("currentContext")) {
      const active = CONTEXTS.find((item) => item.id === currentContext);
      const core = document.getElementById("orbit-core");
      core.className = `orbit-core state-${currentContext}${playing ? " pulsing" : ""}`;
      core.innerHTML = `${iconSvg(active.icon, 31)}<strong>${active.short}</strong><span>${playing ? "Score running" : "Score ready"}</span>`;
    }
    if (changed.includes("playing")) {
      const button = document.getElementById("runtime-play");
      button.innerHTML = `${iconSvg(playing ? "pause" : "play", 16)} ${playing ? "Pause preview" : "Start live preview"}`;
      const active = CONTEXTS.find((item) => item.id === currentContext);
      const core = document.getElementById("orbit-core");
      core.classList.toggle("pulsing", playing);
      core.querySelector("span").textContent = playing ? "Score running" : "Score ready";
    }
  });

  // Initial paint.
  const { project, currentContext, playing } = store.get();
  document.getElementById("integration-snippet").textContent = integrationSnippet(project.name);
  document.getElementById("download-runtime-label").textContent = `Download ${safeFileName(project.name)}.score.js`;
  const active = CONTEXTS.find((item) => item.id === currentContext);
  const core = document.getElementById("orbit-core");
  core.className = `orbit-core state-${currentContext}`;
  core.innerHTML = `${iconSvg(active.icon, 31)}<strong>${active.short}</strong><span>${playing ? "Score running" : "Score ready"}</span>`;
  document.getElementById("runtime-play").innerHTML = `${iconSvg(playing ? "pause" : "play", 16)} ${playing ? "Pause preview" : "Start live preview"}`;
}

function integrationSnippet(projectName) {
  return `import {
  startScore,
  setGameMusicState,
  musicEvent
} from "./${safeFileName(projectName)}.score.js";

// Call once from a player gesture.
await startScore();

// Update when your game state changes.
setGameMusicState({ threat: 0.82, inCombat: true });

// One-shot musical punctuation.
musicEvent("victory");`;
}
