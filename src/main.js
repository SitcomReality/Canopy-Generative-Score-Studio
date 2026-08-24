// Entrypoint. Creates the app state, lazily builds the audio engine on the
// first user gesture (browser autoplay policy), defines every user-facing
// action, and wires the views.
import { hydrateProject } from "./music/default-project.js";

import { PROGRESSIONS } from "./music/progressions.js";
import { composeMelody, makeSparser } from "./music/melody-composer.js";
import { runtimeModule } from "./music/runtime-module.js";
import { buildMidi, melodyFromMidi } from "./music/midi-adapter.js";
import { createAudioEngine } from "./audio/audio-engine.js";
import { createAppState } from "./state/app-state.js";
import { downloadBlob, safeFileName } from "./utils/download.js";
import { mountIcons } from "./ui/icons.js";
import { notify } from "./ui/toast.js";
import { initHeader } from "./ui/header.js";
import { initTransportBar } from "./ui/transport-bar.js";
import { initContextRibbon } from "./ui/context-ribbon.js";
import { initLayersPanel } from "./ui/layers-panel.js";
import { initSequencePanel } from "./ui/sequence-panel.js";
import { initRefinePanel } from "./ui/refine-panel.js";
import { initRuntimeView } from "./ui/runtime-view.js";

const store = createAppState();
let engine = null;

function initializeAudio() {
  if (!engine) engine = createAudioEngine(store);
  return engine;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const actions = {
  setTab(tab) {
    store.set({ tab });
    ["compose", "runtime", "guide"].forEach((id) => {
      const view = document.getElementById(`view-${id}`);
      const active = id === tab;
      view.hidden = !active;
      document.querySelectorAll("#main-tabs .main-tab").forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === tab);
      });
      if (active && !view.dataset.entered) {
        view.dataset.entered = "true";
        view.classList.add("view-enter");
        view.addEventListener("animationend", () => view.classList.remove("view-enter"), { once: true });
      }
    });
  },

  renameProject(name) {
    store.updateProject({ name });
  },

  setBpm(bpm) {
    if (!Number.isFinite(bpm)) return;
    const clamped = Math.max(48, Math.min(150, bpm));
    store.updateProject({ bpm: clamped });
    engine?.setTempo(clamped);
  },

  setKey(key) {
    store.updateProject({ key });
  },

  setScale(scale) {
    store.updateProject({ scale });
  },

  async togglePlayback() {
    await Tone.start();
    initializeAudio();
    const playing = !store.get().playing;
    if (playing) engine.play();
    else engine.pause();
    store.set({ playing });
  },

  stopPlayback() {
    if (engine) engine.stop();
    else store.set({ step: 0 });
    store.set({ playing: false });
  },

  requestContext(next) {
    const { playing, currentContext, queuedContext } = store.get();
    if (playing) {
      store.set({ queuedContext: next });
    } else if (next !== currentContext || queuedContext) {
      store.set({ currentContext: next, queuedContext: null });
      // Keep tempo in sync even when paused: rebuild applies bpm at start,
      // but a live engine should ramp now.
      engine?.setTempo(store.get().project.bpm);
    }
  },

  setThreat(value) {
    store.set({ threat: value });
    const next = value > 68 ? "combat" : value > 30 ? "unease" : "explore";
    const { currentContext, queuedContext } = store.get();
    if (next !== currentContext && next !== queuedContext) actions.requestContext(next);
  },

  queueVictory() {
    store.set({ victoryQueued: true });
    notify(store.get().playing ? "Victory flourish queued for the next bar" : "Victory flourish will play after playback starts");
  },

  toggleMute(layerId) {
    const layers = store.get().project.layers.map((layer) =>
      layer.id === layerId ? { ...layer, muted: !layer.muted } : layer);
    store.updateProject({ layers });
  },

  selectTrack(track) {
    store.set({ selectedTrack: track });
  },

  // Toggle a note lane cell on the selected degree layer.
  setDegreeStep(step, degree) {
    const { project, selectedTrack } = store.get();
    const layers = project.layers.map((layer) => {
      if (layer.id !== selectedTrack) return layer;
      const steps = [...layer.steps];
      steps[step] = steps[step] === degree ? null : degree;
      return { ...layer, steps };
    });
    store.updateProject({ layers });
  },

  // Toggle a beat on the selected on/off layer.
  toggleLayerStep(step) {
    const { project, selectedTrack } = store.get();
    const layers = project.layers.map((layer) => {
      if (layer.id !== selectedTrack) return layer;
      const steps = [...layer.steps];
      steps[step] = !steps[step];
      return { ...layer, steps };
    });
    store.updateProject({ layers });
  },

  composeMelody() {
    const { project, selectedTrack } = store.get();
    const target = project.layers.find((layer) => layer.id === selectedTrack && layer.role === "motif")
      ?? project.layers.find((layer) => layer.role === "motif");
    if (!target) {
      notify("Add a motif layer to compose a melody");
      return;
    }
    const layers = project.layers.map((layer) =>
      layer.id === target.id ? { ...layer, steps: composeMelody(project, layer) } : layer);
    store.updateProject({ layers });
    store.set({ selectedTrack: target.id });
    notify(`New in-key motif composed for ${target.name}`);
  },

  makeSparser() {
    const { project, selectedTrack } = store.get();
    const target = project.layers.find((layer) => layer.id === selectedTrack && layer.role === "motif")
      ?? project.layers.find((layer) => layer.role === "motif");
    if (!target) {
      notify("Add a motif layer to simplify");
      return;
    }
    const layers = project.layers.map((layer) =>
      layer.id === target.id
        ? { ...layer, steps: makeSparser(layer.steps), density: Math.max(20, layer.density - 12) }
        : layer);
    store.updateProject({ layers });
    notify("Motif simplified without changing its harmony");
  },

  resetProject() {
    actions.stopPlayback();
    store.set({ project: hydrateProject({}), currentContext: "explore", threat: 12, selectedTrack: "melody" });
    notify("Starter score restored");
  },

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
        const layers = store.get().project.layers.map((layer) => {
          if (layer.role !== "motif" || placed) return layer;
          placed = true;
          return { ...layer, steps: fitted.melody };
        });
        store.updateProject({ name: fitted.name || file.name.replace(/\.midi?$/i, ""), bpm: fitted.bpm, layers });
        notify("MIDI imported and fitted to the current scale");
      } else {
        const next = hydrateProject(JSON.parse(await file.text()));
        actions.stopPlayback();
        store.set({ project: next });
        notify("Canopy project loaded");
      }
    } catch (error) {
      notify(error instanceof Error ? `Import failed: ${error.message}` : "Import failed");
    } finally {
      const input = document.getElementById("import-file");
      if (input) input.value = "";
    }
  },

  // Per-layer keys (density/variation/humanize) apply to the selected layer;
  // reverb/swing are song-level.
  setParameter(key, value) {
    if (key === "reverb" || key === "swing") {
      store.updateProject({ [key]: value });
      if (key === "reverb") engine?.setReverb(value);
      if (key === "swing") engine?.setSwing(value);
      return;
    }
    const { selectedTrack } = store.get();
    const layers = store.get().project.layers.map((layer) =>
      layer.id === selectedTrack ? { ...layer, [key]: value } : layer);
    store.updateProject({ layers });
  },

  setInstrument(instrument) {
    const { selectedTrack } = store.get();
    const layers = store.get().project.layers.map((layer) =>
      layer.id === selectedTrack ? { ...layer, instrument } : layer);
    store.updateProject({ layers });
    engine?.setInstrument(selectedTrack, instrument);
  },

  setProgression(name) {
    const preset = PROGRESSIONS.find((item) => item.name === name);
    store.updateProject({ progressionName: preset.name, progression: preset.degrees });
  },
};

// ---------------------------------------------------------------------------
// Wire-up
// ---------------------------------------------------------------------------

initHeader(store, actions);
initTransportBar(store, actions);
initContextRibbon(store, actions);
initLayersPanel(store, actions);
initSequencePanel(store, actions);
initRefinePanel(store, actions);
initRuntimeView(store, actions);
mountIcons(document);

// While playing, the audio engine writes step/context/victory changes
// straight into the store; each view reacts through its own subscription.
