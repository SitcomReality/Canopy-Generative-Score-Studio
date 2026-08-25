// Runtime view static parts: integration snippet, runtime download, install
// line. The live score harness (event lab) is wired by ./runtime-harness.js.
import { safeFileName } from "../utils/download.js";

export function initRuntimeView(store, actions) {
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

  const paint = (project) => {
    document.getElementById("integration-snippet").textContent = integrationSnippet(project.name);
    document.getElementById("download-runtime-label").textContent = `Download ${safeFileName(project.name)}.score.js`;
  };

  store.subscribe((changed) => {
    if (changed.includes("project")) paint(store.get().project);
  });

  // Initial paint.
  paint(store.get().project);
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
