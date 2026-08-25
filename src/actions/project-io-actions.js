// Project I/O actions: save/export in all three formats (JSON project,
// standalone runtime module, MIDI sketch) plus JSON/MIDI import.
import { hydrateProject } from "../music/default-project.js";
import { runtimeModule } from "../music/runtime-module.js";
import { buildMidi, melodyFromMidi } from "../music/midi-adapter.js";
import { downloadBlob, safeFileName } from "../utils/download.js";
import { notify } from "../ui/toast.js";

export function createProjectIoActions(store, host) {
  return {
    saveProject() {
      localStorage.setItem("canopy-project", JSON.stringify(store.get().project));
      store.set({ savedAt: `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` });
      notify("Project saved in this browser");
    },

    exportProject() {
      downloadBlob(`${safeFileName(store.get().project.name)}.canopy.json`, JSON.stringify(store.get().project, null, 2), "application/json");
      notify("Editable project exported");
    },

    exportRuntime() {
      downloadBlob(`${safeFileName(store.get().project.name)}.score.js`, runtimeModule(store.get().project), "text/javascript");
      notify("Standalone Tone.js score module exported");
    },

    exportMidi() {
      downloadBlob(`${safeFileName(store.get().project.name)}.mid`, buildMidi(store.get().project), "audio/midi");
      notify("Two-bar MIDI sketch exported");
    },

    async importFile(file) {
      if (!file) return;
      try {
        if (/\.midi?$/i.test(file.name)) {
          const midi = new Midi(await file.arrayBuffer());
          const fitted = melodyFromMidi(midi, store.get().project);
          let placed = false;
          host.stopForHeavyEdit();
          const layers = store.get().project.layers.map((layer) => {
            if (layer.role !== "motif" || placed) return layer;
            placed = true;
            return { ...layer, steps: fitted.melody };
          });
          store.updateProject({ name: fitted.name || file.name.replace(/\.midi?$/i, ""), bpm: fitted.bpm, layers });
          notify("MIDI imported and fitted to the current scale");
        } else {
          const next = hydrateProject(JSON.parse(await file.text()));
          host.stopForHeavyEdit();
          store.set({ project: next });
          // Rebuild so imported layer ids/roles get matching voices.
          host.rebuild();
          notify("Canopy project loaded");
        }
      } catch (error) {
        notify(error instanceof Error ? `Import failed: ${error.message}` : "Import failed");
      } finally {
        const input = document.getElementById("import-file");
        if (input) input.value = "";
      }
    },
  };
}
