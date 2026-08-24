// Entrypoint. Creates the app state, lazily builds the audio engine on the
// first user gesture (browser autoplay policy), defines every user-facing
// action, and wires the views.
import { hydrateProject, DEFAULT_LAYERS, LAYER_ROLES, convertStepsForRole } from "./music/default-project.js";

import { PROGRESSIONS } from "./music/progressions.js";
import { composeMelody, composePattern, makeSparser } from "./music/melody-composer.js";
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

// Adding/removing layers or changing a layer's role changes the synth graph,
// so the engine is rebuilt (keeping playback state) instead of patched.
function rebuildEngine() {
  if (!engine) return;
  const wasPlaying = store.get().playing;
  engine.dispose();
  engine = createAudioEngine(store);
  if (wasPlaying) engine.play();
}

const LAYER_PALETTE = ["#9dc98d", "#f1c97a", "#d98868", "#b8a5d7", "#7fb8c9", "#c9a3b8"];

// Route a compose request to the right generator for the layer's kind.
function composeLayerSteps(project, layer) {
  return LAYER_ROLES[layer.role].kind === "degrees" ? composeMelody(project, layer) : composePattern(layer);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const actions = {
  setTab(tab) {
    store.set({ tab });
    ["compose", "runtime"].forEach((id) => {
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

  // target: "selected" | "all" | a layer id. Degree layers get a composed
  // motif; on/off layers get a role-shaped pattern. Harmony guard holds
  // because degrees only ever come from composeMelody (scale-wrapped).
  composeLayers(target) {
    const { project, selectedTrack } = store.get();
    const chosen = target === "all"
      ? project.layers
      : target === "selected"
        ? project.layers.filter((layer) => layer.id === selectedTrack)
        : project.layers.filter((layer) => layer.id === target);
    if (chosen.length === 0) return;
    const chosenIds = new Set(chosen.map((layer) => layer.id));
    const layers = project.layers.map((layer) =>
      chosenIds.has(layer.id)
        ? { ...layer, steps: composeLayerSteps(project, layer) }
        : layer);
    store.updateProject({ layers });
    notify(`Composed: ${chosen.map((layer) => layer.name).join(", ")}`);
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

  setInstrument(layerId, instrument) {
    const layers = store.get().project.layers.map((layer) =>
      layer.id === layerId ? { ...layer, instrument } : layer);
    store.updateProject({ layers });
    engine?.setInstrument(layerId, instrument);
  },

  setProgression(name) {
    const preset = PROGRESSIONS.find((item) => item.name === name);
    store.updateProject({ progressionName: preset.name, progression: preset.degrees });
  },

  // Patch the song-level macro journey (shape / length / depth).
  setJourney(patch) {
    const journey = { ...(store.get().project.journey ?? { shape: "flat", length: 16, depth: 0 }), ...patch };
    store.updateProject({ journey });
  },

  // 0 = fully random; a positive seed reproduces the same drift sequence.
  setVariationSeed(value) {
    const seed = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    store.updateProject({ variationSeed: seed });
  },

  addLayer() {
    const { project } = store.get();
    const index = project.layers.length;
    const layer = {
      id: `layer-${Date.now().toString(36)}`,
      name: index >= DEFAULT_LAYERS.length ? `New layer ${index - DEFAULT_LAYERS.length + 1}` : "New layer",
      detail: "Main motif",
      role: "motif",
      color: LAYER_PALETTE[index % LAYER_PALETTE.length],
      muted: false,
      instrument: "Glass bell",
      density: 50,
      variation: 30,
      humanize: 15,
      restWindow: 0,
      energyRole: "balanced",
      activity: null,
      fills: null,
      automation: [],
      steps: Array(16).fill(null),
    };
    store.updateProject({ layers: [...project.layers, layer] });
    store.set({ selectedTrack: layer.id });
    rebuildEngine();
    notify(`${layer.name} added — rename it in the Selected layer panel`);
    actions.beginRenameLayer();
  },

  beginRenameLayer() {
    const input = document.getElementById("refine-track-name");
    if (!input) return;
    input.focus();
    input.select();
  },

  renameLayer(layerId, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const layers = store.get().project.layers.map((layer) =>
      layer.id === layerId ? { ...layer, name: trimmed } : layer);
    store.updateProject({ layers });
  },

  removeLayer(layerId) {
    const { project, selectedTrack } = store.get();
    if (project.layers.length <= 1) {
      notify("A score needs at least one layer");
      return;
    }
    const layers = project.layers.filter((layer) => layer.id !== layerId);
    store.updateProject({ layers });
    if (selectedTrack === layerId) store.set({ selectedTrack: layers[0].id });
    rebuildEngine();
    notify("Layer removed");
  },

  setLayerRole(layerId, role) {
    if (!layerId) return;
    const { project } = store.get();
    const layers = project.layers.map((layer) => {
      if (layer.id !== layerId || layer.role === role) return layer;
      return {
        ...layer,
        role,
        detail: LAYER_ROLES[role].label,
        steps: convertStepsForRole(layer.steps, layer.role, role),
      };
    });
    store.updateProject({ layers });
    rebuildEngine();
    notify("Layer role changed");
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
