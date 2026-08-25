// Studio preview host: a thin composition root that builds the master chain
// and layer voices, then hands them to the 16-step sequencer. The transport
// callback reads live values from the passed-in `store`, so parameter changes
// apply without re-subscribing. Adaptive *decisions* come from the shared
// pure core in ../music/dynamics.js; graph construction lives in
// ./master-chain.js and ./voices.js, step logic in ./sequencer.js.
import { createMasterChain } from "./master-chain.js";
import { createVoices, createLayerVoice, makeDrums, ROLE_VOLUME } from "./voices.js";
import { createSequencer } from "./sequencer.js";
import { makeRng } from "../music/variation.js";
import { resolveInstrumentConfig } from "../music/instrument-override.js";

export function createAudioEngine(store) {
  const project = store.get().project;
  const chain = createMasterChain(project);

  const disposables = [];
  // Bass and dry drums land straight on the glue/limiter path; hats ride the
  // reverb; pitched buses carry their own space (see master-chain).
  const buses = { harmony: chain.harmonyBus, motif: chain.motifBus, dry: chain.limiter, bass: chain.bassBus, reverb: chain.reverb, glue: chain.glue };
  const voices = createVoices(project, buses, disposables);
  disposables.push(chain);

  // Performance copies of motif phrases. The written phrase in the project
  // is never modified; at each bar boundary motif layers get a fresh drift
  // pass derived from it, scaled by their "Safe variation" slider.
  const perfSteps = {};
  for (const layer of project.layers) {
    if ((voices[layer.id]?.kind ?? layer.role) === "melody") perfSteps[layer.id] = [...layer.steps];
  }

  const sequencer = createSequencer({ store, voices, perfSteps });

  const transport = Tone.getTransport();
  transport.bpm.value = project.bpm;
  transport.swing = project.swing / 100;
  transport.swingSubdivision = "8n";

  const loopId = transport.scheduleRepeat((time) => sequencer.handleStep(time), "8n");

  const firstVoiceOf = (kind) => project.layers.map((layer) => voices[layer.id]).find((voice) => voice.kind === kind);

  // Push a resolved config into the live synth. Same voice class only —
  // pluck synths have nothing settable here (their shape is constructor-time).
  function applyConfig(target, cfg) {
    if (!target.synth || target.voiceClass === "pluck") return;
    const { voice, pluck, ...options } = cfg;
    target.synth.set({ ...options, volume: ROLE_VOLUME[target.kind] });
  }

  // Dispose exactly the nodes a pitched bundle owns and build a fresh one
  // from the layer's current project state (preset + override).
  function rebuildVoice(layerId) {
    const layer = store.get().project.layers.find((item) => item.id === layerId);
    const target = voices[layerId];
    if (!layer || !target || target.kind === "drums") return;
    const nodes = target.nodes ?? [target.synth];
    nodes.forEach((node) => node.dispose());
    for (let i = disposables.length - 1; i >= 0; i--) {
      if (nodes.includes(disposables[i])) disposables.splice(i, 1);
    }
    voices[layerId] = createLayerVoice(layer, buses, disposables);
  }

  return {
    setReverb(value) {
      chain.setReverb(value);
    },
    setSwing(value) {
      transport.swing = value / 100;
    },
    setTempo(bpm) {
      // v5: tempo is static during playback — no adaptive offset.
      transport.bpm.rampTo(bpm, 0.6);
    },
    setInstrument(layerId, instrument) {
      const layer = store.get().project.layers.find((item) => item.id === layerId);
      const target = voices[layerId];
      if (!layer || !target) return;
      if (target.kind === "drums") {
        // Swap the kit live; dispose the old nodes afterwards.
        const old = [target.kick, target.hat, ...(target.snare ? [target.snare] : []), ...(target.extras ?? [])];
        const next = makeDrums(instrument, { kick: chain.limiter, hat: chain.reverb, snare: chain.glue });
        voices[layerId] = next;
        disposables.push(next.kick, next.hat, ...(next.snare ? [next.snare] : []), ...(next.extras ?? []));
        old.forEach((node) => node.dispose());
        return;
      }
      const role = target.kind === "chords" ? "harmony" : target.kind === "melody" ? "motif" : "bass";
      const cfg = resolveInstrumentConfig(layer, role);
      if ((cfg.voice ?? "synth") !== target.voiceClass) {
        // Different synth family (plain/FM/pluck): rebuild the voice rather
        // than .set()-ing foreign options onto the old class.
        rebuildVoice(layerId);
      } else {
        applyConfig(target, cfg);
      }
    },
    // Re-apply a layer's resolved instrument config (preset + override) to
    // its live synth — the live path for inspector tweak sliders.
    applyInstrumentConfig(layerId) {
      const layer = store.get().project.layers.find((item) => item.id === layerId);
      const target = voices[layerId];
      if (!layer || !target || target.kind === "drums") return;
      const role = target.kind === "chords" ? "harmony" : target.kind === "melody" ? "motif" : "bass";
      const cfg = resolveInstrumentConfig(layer, role);
      if ((cfg.voice ?? "synth") !== target.voiceClass) {
        rebuildVoice(layerId);
      } else {
        applyConfig(target, cfg);
      }
    },
    play() {
      sequencer.setDriftRng(makeRng(store.get().project.variationSeed ?? 0));
      transport.start("+0.05");
    },
    pause() {
      transport.pause();
    },
    stop() {
      transport.stop();
      transport.position = 0;
      sequencer.reset();
    },
    dispose() {
      transport.clear(loopId);
      disposables.forEach((node) => node.dispose());
    },
  };
}
