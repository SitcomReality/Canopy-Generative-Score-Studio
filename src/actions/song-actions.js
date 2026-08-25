// Song-level editing actions: project identity, tempo/key/scale, chord path,
// shared mix parameters (reverb/swing), the journey macro, variation seed,
// and the reactive schema's song-level pieces (context targets, verses).
import { PROGRESSIONS } from "../music/progressions.js";

export function createSongActions(store, host) {
  return {
    renameProject(name) {
      store.updateProject({ name });
    },

    setBpm(bpm) {
      if (!Number.isFinite(bpm)) return;
      const clamped = Math.max(48, Math.min(150, bpm));
      store.updateProject({ bpm: clamped });
      host.engine?.setTempo(clamped);
    },

    setKey(key) {
      store.updateProject({ key });
    },

    setScale(scale) {
      store.updateProject({ scale });
    },

    // Per-layer keys (density/variation/humanize) apply to the selected
    // layer; reverb/swing are song-level.
    setParameter(key, value) {
      if (key === "reverb" || key === "swing") {
        store.updateProject({ [key]: value });
        if (key === "reverb") host.engine?.setReverb(value);
        if (key === "swing") host.engine?.setSwing(value);
        return;
      }
      const { selectedTrack } = store.get();
      const layers = store.get().project.layers.map((layer) =>
        layer.id === selectedTrack ? { ...layer, [key]: value } : layer);
      store.updateProject({ layers });
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

    // Reshape how a context feels: its axis targets ease in at bar boundaries.
    setContextTarget(contextId, axis, value) {
      const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
      const contexts = store.get().project.contexts.map((ctx) =>
        ctx.id === contextId ? { ...ctx, targets: { ...ctx.targets, [axis]: clamped } } : ctx);
      store.updateProject({ contexts });
    },

    // Replace the whole sections list; the engine rotates it at bar boundaries.
    setSections(sections) {
      store.updateProject({ sections });
    },
  };
}
