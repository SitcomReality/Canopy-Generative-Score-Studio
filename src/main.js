// Composition root / entry point. Creates the app state and engine host,
// assembles the action modules, and wires the views. All actual logic lives
// in the single-purpose modules under src/actions/, src/audio/, src/ui/ and
// src/music/.
import { createAppState } from "./state/app-state.js";
import { createEngineHost } from "./audio/engine-host.js";
import { createPlaybackActions } from "./actions/playback-actions.js";
import { createSongActions } from "./actions/song-actions.js";
import { createLayerActions } from "./actions/layer-actions.js";
import { createProjectIoActions } from "./actions/project-io-actions.js";
import { createTabActions } from "./ui/tab-actions.js";
import { mountIcons } from "./ui/icons.js";
import { initHeader } from "./ui/header.js";
import { initTransportBar } from "./ui/transport-bar.js";
import { initContextRibbon } from "./ui/context-ribbon.js";
import { initLayersPanel } from "./ui/layers-panel.js";
import { initSequencePanel } from "./ui/sequence-panel.js";
import { initRefinePanel } from "./ui/refine-panel.js";
import { initInstrumentEditor } from "./ui/instrument-editor.js";
import { initInstrumentLibrary } from "./ui/instrument-library.js";
import { initLayersOverview } from "./ui/layers-overview.js";
import { initJourneyStrip } from "./ui/journey-strip.js";
import { initDynamicsPanel } from "./ui/dynamics-panel.js";
import { initLayerReactive } from "./ui/layer-reactive.js";
import { initRuntimeHarness } from "./ui/runtime-harness.js";

const store = createAppState();
const host = createEngineHost(store);

const actions = {
  ...createTabActions(store),
  ...createPlaybackActions(store, host),
  ...createSongActions(store, host),
  ...createLayerActions(store, host),
  ...createProjectIoActions(store, host),
};

initHeader(store, actions);
initTransportBar(store, actions);
initContextRibbon(store, actions);
initLayersPanel(store, actions);
initLayersOverview(store, actions);
initSequencePanel(store, actions);
initRefinePanel(store, actions);
initInstrumentEditor(store, actions);
initInstrumentLibrary(store, actions);
initJourneyStrip(store);
initDynamicsPanel(store, actions);
initLayerReactive(store, actions);
initRuntimeHarness(store);
mountIcons(document);

// While playing, the audio engine writes step/context/victory changes
// straight into the store; each view reacts through its own subscription.
