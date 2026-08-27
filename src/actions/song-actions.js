// Song-level editing actions: project identity, tempo/key/scale, chord path,
// shared mix parameters (reverb/swing/space), the journey macro, variation seed,
// and the reactive schema's song-level pieces (verses).
import { PROGRESSIONS } from "../music/progressions.js";
import { INSTRUMENTS } from "../music/instruments.js";

export function createSongActions(store, host) {
  // Seed a new custom instrument either from a catalog preset or a blank pluck.
  function seedCustom(seedPreset) {
    if (seedPreset && INSTRUMENTS[seedPreset]) {
      return {
        voice: { ...INSTRUMENTS[seedPreset].motif },
        percussion: { ...INSTRUMENTS[seedPreset].percussion },
      };
    }
    return {
      voice: { oscillator: { type: "triangle" }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.1, release: 1.2 } },
      percussion: { kick: { pitchDecay: 0.05, octaves: 5, envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.2 } }, hat: { noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } } },
    };
  }

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

    // Per-role space/room sends (0..1) applied live to the master chain.
    setSpace(patch) {
      const fallback = { lead: 0.3, bed: 0.32, bass: 0.12, echo: 0.2 };
      const space = { ...fallback, ...(store.get().project.space ?? {}), ...patch };
      store.updateProject({ space });
      host.engine?.setSpace(space);
    },

    // Replace the whole sections list; the engine rotates it at bar boundaries.
    setSections(sections) {
      store.updateProject({ sections });
    },

    // Set or clear a song-level atmosphere binding for a target. `binding` is
    // { axis, domain: [low, high] } or null to unbind. The engine resolves
    // bound targets against the live axes at each bar boundary.
    setBinding(target, binding) {
      if (!target) return;
      const bindings = (store.get().project.bindings ?? []).filter((b) => b.target !== target);
      if (binding && typeof binding.axis === "string" && Array.isArray(binding.domain) && binding.domain.length === 2) {
        bindings.push({ target, axis: binding.axis, domain: [Number(binding.domain[0]), Number(binding.domain[1])] });
      }
      store.updateProject({ bindings });
    },

    // ---- custom instruments (v6) --------------------------------------
    addCustomInstrument(name, seedPreset) {
      const id = `custom-${Date.now().toString(36)}`;
      const instruments = { ...store.get().project.instruments, [id]: { label: name || "New instrument", ...seedCustom(seedPreset) } };
      store.updateProject({ instruments });
      host.rebuild?.();
      return id;
    },

    updateCustomInstrument(id, patch) {
      const instruments = { ...store.get().project.instruments };
      if (!instruments[id]) return;
      instruments[id] = { ...instruments[id], ...patch };
      store.updateProject({ instruments });
    },

    removeCustomInstrument(id) {
      const instruments = { ...store.get().project.instruments };
      if (!instruments || !instruments[id]) return;
      delete instruments[id];
      store.updateProject({ instruments });
      host.rebuild?.();
    },
  };
}
