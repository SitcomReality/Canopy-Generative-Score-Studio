// Runtime harness: loads the actual exported .score.js module in-page (blob
// import with the vendored Tone UMD shimmed in) and drives it exclusively
// through its public API — startScore/stopScore/disposeScore,
// setGameMusicState, musicEvent — so what you hear is exactly what a game
// consumes. Live state comes from the additive getRuntimeInfo() reader.
// Painting lives in ./readout.js, control wiring in ./controls.js.
import { runtimeModule, scoreEngineSource } from "../../music/runtime-module.js";
import { safeFileName } from "../../utils/download.js";
import { createToneShimUrl } from "../../utils/tone-shim.js";
import { notify } from "../toast.js";
import { getTimingEngine } from "../../timing/index.js";
import { createLogger, paintTransport, paintAxes, paintCore } from "./readout.js";
import { wireControls } from "./controls.js";

const POLL_MS = 250;

export function initRuntimeHarness(store) {
  const els = {
    sourceLabel: document.getElementById("harness-source-label"),
    useProject: document.getElementById("harness-use-project"),
    loadFile: document.getElementById("harness-load-file"),
    fileInput: document.getElementById("harness-file"),
    start: document.getElementById("harness-start"),
    stop: document.getElementById("harness-stop"),
    dispose: document.getElementById("harness-dispose"),
    threat: document.getElementById("harness-threat"),
    threatValue: document.getElementById("harness-threat-value"),
    combat: document.getElementById("harness-combat"),
    flourishes: document.getElementById("harness-flourishes"),
    axesOverride: document.getElementById("harness-axes-override"),
    axesClear: document.getElementById("harness-axes-clear"),
    core: document.getElementById("orbit-core"),
    bar: document.getElementById("harness-bar"),
    axes: document.getElementById("harness-axes"),
    verse: document.getElementById("harness-verse"),
    log: document.getElementById("harness-log"),
  };

  let module = null;      // imported .score.js namespace
  let moduleUrl = null;   // its blob URL (revoked on reload)
  let fromProject = false;
  let pollTimer = null;
  let last = null;        // previous getRuntimeInfo() snapshot, for diffing

  const log = createLogger(els.log);

  const call = async (label, fn) => {
    if (!module) return;
    try {
      await fn(module);
      log(`→ ${label}`);
    } catch (error) {
      notify(`${label} failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  // The exported score is DATA ONLY; the engine comes from the shared
  // scoreEngineSource(). Both are blob-imported and combined here so the
  // harness drives the exact public API a game consumes.
  async function loadSource(scoreSource, engineSource, name, isProject) {
    if (module) {
      try { module.disposeScore(); } catch { /* already gone */ }
      module = null;
    }
    if (moduleUrl) URL.revokeObjectURL(moduleUrl);
    getTimingEngine().clearInterval(pollTimer);
    pollTimer = null;
    last = null;
    try {
      const shim = createToneShimUrl();
      const scoreUrl = URL.createObjectURL(new Blob([scoreSource], { type: "text/javascript" }));
      const scoreModule = await import(scoreUrl);
      const engineUrl = URL.createObjectURL(new Blob([engineSource.replace(/from\s*"tone"/, `from "${shim}"`)], { type: "text/javascript" }));
      const engineModule = await import(engineUrl);
      module = engineModule.createScoreEngine(scoreModule.score);
      fromProject = isProject;
      els.sourceLabel.textContent = name;
      log(`Loaded ${name}`);
      paintTransport(els, Boolean(module));
      pollTimer = getTimingEngine().setInterval(poll, POLL_MS);
    } catch (error) {
      module = null;
      els.sourceLabel.textContent = "No score loaded";
      notify(error instanceof Error ? `Could not load score: ${error.message}` : "Could not load score");
    }
  }

  const loadFromProject = () => {
    const project = store.get().project;
    return loadSource(runtimeModule(project), scoreEngineSource(), `${safeFileName(project.name)}.score.js (current project)`, true);
  };

  const loadFromFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    await loadSource(text, scoreEngineSource(), file.name, false);
  };

  function poll() {
    if (!module) return;
    let info;
    try {
      info = module.getRuntimeInfo();
    } catch {
      return;
    }
    if (last) {
      if (info.context !== last.context) log(`bar ${info.bar}: context → ${info.context}`);
      if (info.sectionId !== last.sectionId) log(`bar ${info.bar}: verse → ${info.sectionId ?? "(none)"}`);
      if (info.playing !== last.playing) log(info.playing ? "transport started" : "transport stopped");
    }
    last = info;
    paintCore(els, info);
    paintAxes(els, info.liveAxes);
  }

  // --- Wiring ---------------------------------------------------------------

  els.useProject.addEventListener("click", loadFromProject);
  els.loadFile.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => {
    loadFromFile(els.fileInput.files[0]);
    els.fileInput.value = "";
  });

  wireControls({ els, call });

  // Editing the project invalidates the generated module: reload it so the
  // harness always tests the current export. A user-loaded file is left alone.
  store.subscribe((changed) => {
    if (!changed.includes("project") || !fromProject) return;
    const wasPlaying = last?.playing ?? false;
    loadFromProject().then(() => {
      if (wasPlaying && module) {
        module.startScore();
        log("Reloaded after edit; restarted score");
      }
    });
  });

  // Initial paint: load the starter project's module (silent until Start).
  paintTransport(els, false);
  paintCore(els, null);
  paintAxes(els, null);
  loadFromProject();
}
