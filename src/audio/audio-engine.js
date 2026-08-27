// Studio preview host: a thin composition root that builds the master chain
// and layer voices, then hands them to the timing engine's step source. The
// engine owns all timing (the audio↔musical baseline, lookahead windows, the
// ticker) and the per-layer gates; this module owns the audio graph and voice
// realization. Adaptive *decisions* come from the shared pure core in
// ../music/dynamics.js; graph construction lives in ./master-chain.js and
// ./voices.js, step logic in ./sequencer.js.
import { createMasterChain } from "./master-chain.js";
import { createVoices, createLayerVoice, makeDrums, ROLE_VOLUME } from "./voices.js";
import { createSequencer } from "./sequencer.js";
import { getTimingEngine } from "../timing/index.js";
import { STEPS_PER_BEAT } from "../timing/core.js";
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

  // The single time authority for this preview. It owns the baseline, the
  // lookahead ticker (real Tone.now() + interval), and per-layer gates; the
  // sequencer plugs in as its step source.
  // The app's single time authority. It is a module singleton so the whole app
  // (playback AND the UI timer/frame service) shares one clock and one ticker;
  // the sequencer plugs in as its step source. `createTimingEngine()` is used
  // only by tests.
  const engine = getTimingEngine();
  engine.setTempo(project.bpm); // initial rate; play() honors it as a cold-start rate
  engine.setSwing((project.swing ?? 0) / 100);
  // Sync the engine's gates from the persisted project so a fresh or rebuilt
  // engine reflects each layer's mute state (mute is gate-only, never RNG).
  for (const layer of project.layers) {
    engine.setLayerEnabled(layer.id, !layer.muted);
  }
  const sequencer = createSequencer({ store, voices, perfSteps, engine });
  sequencer.attach();
  // Adaptive voice budget: when the engine's tick loop falls behind the audio
  // clock (a catch-up burst), it suggests a tighter budget; apply it to the
  // sequencer so a dense mix thins itself to keep up on low-end machines.
  engine.setGovernor((budget) => sequencer.setVoiceBudget(budget));

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
    voices[layerId] = createLayerVoice(layer, buses, disposables, store.get().project);
  }

  return {
    setReverb(value) {
      chain.setReverb(value);
    },
    setSpace(space) {
      chain.setSpace(space);
    },
    setSwing(value) {
      // The UI stores swing as a 0-100 percentage; the engine wants a 0-1
      // off-beat delay ratio (0 = straight).
      engine.setSwing(value / 100);
    },
    // Voice/polyphony budget: cap the mix's concurrent voices so a dense
    // arrangement stays renderable on low-end systems (see sequencer/polyphony.js).
    // Lower = thinner / cheaper; default 20 keeps lean songs untouched.
    setVoiceBudget(budget) {
      sequencer.setVoiceBudget(budget);
      return sequencer.getVoiceBudget();
    },
    setTempo(bpm) {
      // v5: tempo is static during playback — no adaptive offset. The engine
      // defers the re-anchor to the next half-bar boundary (continuous, no ramp).
      engine.setTempo(bpm);
    },
    // Jump the loop position to a specific step (0..15). The timing engine
    // re-anchors at the nearest half-beat so a mid-loop seek keeps the
    // schedule continuous (and in-flight voices' strict-increase guard holds,
    // since the next dispatch time is still after the last one).
    seek(frameStep) {
      engine.setPosition(frameStep / STEPS_PER_BEAT);
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
      const cfg = resolveInstrumentConfig(layer, role, store.get().project);
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
      const cfg = resolveInstrumentConfig(layer, role, store.get().project);
      if ((cfg.voice ?? "synth") !== target.voiceClass) {
        rebuildVoice(layerId);
      } else {
        applyConfig(target, cfg);
      }
    },
    // Mute/solo toggles route to the engine's gates. They are gate-only: the
    // engine emits identically through a toggle (it never re-anchors or
    // rebuilds; only whether events realize changes).
    setLayerMuted(layerId, muted) {
      engine.setLayerEnabled(layerId, !muted);
    },
    setLayerSolo(layerId) {
      engine.setLayerSolo(layerId);
    },
    clearSolo() {
      engine.clearSolo();
    },
    play() {
      // Reset long-form arrangement state first, then seed the drift RNG (so a
      // non-zero variationSeed reproduces the same sequence), then start the
      // clock. The engine anchors the baseline and begins lookahead dispatch.
      sequencer.reset();
      sequencer.setDriftRng(makeRng(store.get().project.variationSeed ?? 0));
      engine.play();
    },
    pause() {
      engine.pause();
    },
    stop() {
      engine.stop();
      sequencer.reset();
    },
    dispose() {
      // Stop scheduling + release in-flight voices, then free the graph nodes.
      // The shared engine itself is NOT disposed here (it is the app's one
      // time authority, kept alive for the UI timer service across rebuilds);
      // the next audio-engine re-registers its sequencer and re-syncs gates.
      engine.stop();
      disposables.forEach((node) => node.dispose());
    },
  };
}