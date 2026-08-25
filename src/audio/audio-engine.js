// Studio preview host: a thin composition root that builds the master chain
// and layer voices, then hands them to the 16-step sequencer. The transport
// callback reads live values from the passed-in `store`, so parameter changes
// apply without re-subscribing. Adaptive *decisions* come from the shared
// pure core in ../music/dynamics.js; graph construction lives in
// ./master-chain.js and ./voices.js, step logic in ./sequencer.js.
import { createMasterChain } from "./master-chain.js";
import { createVoices } from "./voices.js";
import { createSequencer } from "./sequencer.js";
import { makeRng } from "../music/variation.js";
import { instrumentSettings } from "../music/instruments.js";
import { makeDrums } from "./voices.js";

export function createAudioEngine(store) {
  const project = store.get().project;
  const chain = createMasterChain(project);

  const disposables = [];
  // Bass and dry drums land straight on the glue/limiter path; hats ride the
  // reverb; pitched buses carry their own space (see master-chain).
  const voices = createVoices(
    project,
    { harmony: chain.harmonyBus, motif: chain.motifBus, dry: chain.limiter, reverb: chain.reverb, glue: chain.glue },
    disposables,
  );
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
      const target = voices[layerId];
      if (!target) return;
      if (target.kind === "melody" || target.kind === "chords") {
        const role = target.kind === "chords" ? "harmony" : "motif";
        // Strip preset-only keys the live synth class may not know.
        const { voice, pluck, ...options } = instrumentSettings(instrument, role);
        target.synth.set({ ...options, volume: target.kind === "chords" ? -16 : -9 });
      } else if (target.kind === "bass") {
        const { voice, pluck, ...options } = instrumentSettings(instrument, "bass");
        target.synth.set({ ...options, volume: -11 });
      } else if (target.kind === "drums") {
        // Swap the kit live; dispose the old nodes afterwards.
        const old = [target.kick, target.hat, ...(target.snare ? [target.snare] : []), ...(target.extras ?? [])];
        const next = makeDrums(instrument, { kick: chain.limiter, hat: chain.reverb, snare: chain.glue });
        voices[layerId] = next;
        disposables.push(next.kick, next.hat, ...(next.snare ? [next.snare] : []), ...(next.extras ?? []));
        old.forEach((node) => node.dispose());
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
