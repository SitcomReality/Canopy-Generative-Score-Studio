// Voice builders: turn an instrument preset config into live Tone nodes, one
// bundle per layer. Mirrored (as emitted source text) by
// music/runtime-module.js — keep the two behaviorally identical.
import { instrumentSettings } from "../music/instruments.js";

// Per-kind base loudness in dB for pitched voices.
export const ROLE_VOLUME = { melody: -9, chords: -16, bass: -11 };

// Build a pitched voice from a role config: a plain PolySynth(Tone.Synth)
// unless the preset declares `voice: "fm"` (PolySynth(FMSynth)) or
// `voice: "pluck"` (Karplus-strong PluckSynth).
export function makePitched(roleKey, cfg) {
  const { voice, pluck, ...options } = cfg;
  if (voice === "pluck") {
    const synth = new Tone.PluckSynth({ ...(pluck ?? {}), volume: ROLE_VOLUME[roleKey] });
    return synth;
  }
  if (voice === "fm") {
    return new Tone.PolySynth(Tone.FMSynth).set({ ...options, volume: ROLE_VOLUME[roleKey] });
  }
  return new Tone.PolySynth(Tone.Synth).set({ ...options, volume: ROLE_VOLUME[roleKey] });
}

// Build the percussion kit for one layer. Targets decide where each drum
// lands in the graph (the studio routes into buses; the runtime template
// connects straight to destinations).
export function makeDrums(instrument, targets) {
  const preset = instrumentSettings(instrument, "percussion");
  const extras = [];
  const kick = new Tone.MembraneSynth({ ...preset.kick, volume: -10 }).connect(targets.kick);
  const hatFilter = preset.hatFilter
    ? new Tone.Filter({ type: "highpass", frequency: preset.hatFilter }).connect(targets.hat)
    : null;
  const hat = new Tone.NoiseSynth({ ...preset.hat, volume: -24 }).connect(hatFilter ?? targets.hat);
  if (hatFilter) extras.push(hatFilter);
  let snare = null;
  if (preset.snare) {
    const snareFilter = preset.snareFilter
      ? new Tone.Filter({ type: "bandpass", frequency: preset.snareFilter, Q: 0.8 }).connect(targets.snare)
      : null;
    snare = new Tone.NoiseSynth({ ...preset.snare, volume: -14 }).connect(snareFilter ?? targets.snare);
    if (snareFilter) extras.push(snareFilter);
  }
  return { kind: "drums", kick, hat, snare, extras };
}

// One voice bundle per layer, keyed by layer id. Layers added later rebuild
// the engine, so this map always mirrors the project's layers at construction
// time.
export function createVoices(project, buses, disposables) {
  const voices = {};
  for (const layer of project.layers) {
    if (layer.role === "harmony") {
      const synth = makePitched("chords", instrumentSettings(layer.instrument, "harmony"));
      synth.connect(buses.harmony);
      voices[layer.id] = { kind: "chords", synth };
      disposables.push(synth);
    } else if (layer.role === "motif") {
      const synth = makePitched("melody", instrumentSettings(layer.instrument, "motif"));
      synth.connect(buses.motif);
      voices[layer.id] = { kind: "melody", synth };
      disposables.push(synth);
    } else if (layer.role === "bass") {
      const cfg = instrumentSettings(layer.instrument, "bass");
      const synth = cfg.pluck ? makePitched("bass", cfg) : new Tone.MonoSynth({ ...cfg, volume: -11 });
      if (!cfg.pluck) synth.connect(buses.dry);
      else synth.toDestination();
      voices[layer.id] = { kind: "bass", synth };
      disposables.push(synth);
    } else if (layer.role === "percussion") {
      const kit = makeDrums(layer.instrument, { kick: buses.dry, hat: buses.reverb, snare: buses.glue });
      voices[layer.id] = kit;
      disposables.push(kit.kick, kit.hat, ...(kit.snare ? [kit.snare] : []), ...(kit.extras ?? []));
    }
  }
  return voices;
}
