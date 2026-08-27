// Header bar: brand (returns to Compose), main tabs, save/import/export.
import { notify } from "./toast.js";

export function initHeader(store, actions) {
  const tabs = document.getElementById("main-tabs");
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (button) actions.setTab(button.dataset.tab);
  });
  document.getElementById("brand-lockup").addEventListener("click", () => actions.setTab("compose"));

  document.getElementById("save-button").addEventListener("click", actions.saveProject);
  document.getElementById("import-button").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", (event) => actions.importFile(event.target.files[0]));

  const exportMenu = document.getElementById("export-menu");
  document.getElementById("export-toggle").addEventListener("click", () => {
    exportMenu.hidden = !exportMenu.hidden;
  });
  document.getElementById("export-project").addEventListener("click", () => {
    exportMenu.hidden = true;
    actions.exportProject();
  });
  document.getElementById("export-runtime").addEventListener("click", () => {
    exportMenu.hidden = true;
    actions.exportRuntime();
  });
  document.getElementById("export-engine").addEventListener("click", () => {
    exportMenu.hidden = true;
    actions.exportEngine();
  });
  document.getElementById("export-midi").addEventListener("click", () => {
    exportMenu.hidden = true;
    actions.exportMidi();
  });

  store.subscribe((changed) => {
    if (!changed.includes("savedAt")) return;
    document.getElementById("save-state-text").textContent = store.get().savedAt;
  });
}
