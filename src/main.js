// Entrypoint. Creates the app state, lazily builds the audio engine on the
// first user gesture (browser autoplay policy), defines every user-facing
// action, and wires the views.
import { DEFAULT_PROJECT, hydrateProject } from "./music/default-project.js";
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

  toggleMute(track) {
    const muted = { ...store.get().project.muted, [track]: !store.get().project.muted[track] };
    store.updateProject({ muted });
  },

  selectTrack(track) {
    store.set({ selectedTrack: track });
  },

  setMelodyStep(step, degree) {
    const melody = [...store.get().project.melody];
    melody[step] = melody[step] === degree ? null : degree;
    store.updateProject({ melody });
  },

  toggleBooleanStep(track, step) {
    const values = [...store.get().project[track]];
    values[step] = !values[step];
    store.updateProject({ [track]: values });
  },

  composeMelody() {
    store.updateProject({ melody: composeMelody(store.get().project) });
    notify("New in-key motif composed");
  },

  makeSparser() {
    const project = store.get().project;
    store.updateProject({
      melody: makeSparser(project.melody),
      density: Math.max(20, project.density - 12),
    });
    notify("Motif simplified without changing its harmony");
  },

  resetProject() {
    actions.stopPlayback();
    store.set({ project: { ...DEFAULT_PROJECT }, currentContext: "explore", threat: 12 });
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
        store.updateProject({ name: fitted.name || file.name.replace(/\.midi?$/i, ""), bpm: fitted.bpm, melody: fitted.melody });
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

  setParameter(key, value) {
    store.updateProject({ [key]: value });
    if (key === "reverb") engine?.setReverb(value);
    if (key === "swing") engine?.setSwing(value);
  },

  setInstrument(instrument) {
    store.updateProject({ instrument });
    engine?.setInstrument(instrument);
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
