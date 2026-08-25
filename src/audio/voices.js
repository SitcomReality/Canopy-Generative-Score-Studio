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

// Tone.PluckSynth has no velocity parameter — triggerAttackRelease ignores
// it. To keep per-note expression alive on pluck presets we route them
// through a serial gain node that the sequencer retimes to each note's
// velocity just before triggering.
function makeVelocityPath(synth, connectTo, disposables, baseGain = 1) {
  const velGain = new Tone.Gain(baseGain);
  synth.disconnect();
  synth.connect(velGain);
  velGain.connect(connectTo);
  velGain.baseGain = baseGain;
  disposables.push(velGain);
  return { synth, velGain };
}

// One voice bundle per layer, keyed by layer id. Layers added later rebuild
// the engine, so this map always mirrors the project's layers at construction
// time.
export function createVoices(project, buses, disposables) {
  const voices = {};
  for (const layer of project.layers) {
    if (layer.role === "harmony") {
      const cfg = instrumentSettings(layer.instrument, "harmony");
      const synth = makePitched("chords", cfg);
      let bundle;
      if (cfg.voice === "pluck") {
        bundle = { kind: "chords", ...makeVelocityPath(synth, buses.harmony, disposables) };
      } else {
        synth.connect(buses.harmony);
        bundle = { kind: "chords", synth };
      }
      voices[layer.id] = bundle;
      disposables.push(synth);
    } else if (layer.role === "motif") {
      const cfg = instrumentSettings(layer.instrument, "motif");
      const synth = makePitched("melody", cfg);
      let bundle;
      if (cfg.voice === "pluck") {
        bundle = { kind: "melody", ...makeVelocityPath(synth, buses.motif, disposables) };
      } else {
        synth.connect(buses.motif);
        bundle = { kind: "melody", synth };
      }
      voices[layer.id] = bundle;
      disposables.push(synth);
    } else if (layer.role === "bass") {
      const cfg = instrumentSettings(layer.instrument, "bass");
      const synth = cfg.voice === "pluck" ? makePitched("bass", cfg) : new Tone.MonoSynth({ ...cfg, volume: -11 });
      let bundle;
      if (cfg.voice === "pluck") {
        // PluckSynth ignores its options.volume; keep the bass role trim
        // (-11 dB) on the velocity path instead.
        bundle = { kind: "bass", ...makeVelocityPath(synth, buses.dry, disposables, Math.pow(10, -11 / 20)) };
      } else {
        synth.connect(buses.dry);
        bundle = { kind: "bass", synth };
      }
      voices[layer.id] = bundle;
      disposables.push(synth);
    } else if (layer.role === "percussion") {
      const kit = makeDrums(layer.instrument, { kick: buses.dry, hat: buses.reverb, snare: buses.glue });
      voices[layer.id] = kit;
      disposables.push(kit.kick, kit.hat, ...(kit.snare ? [kit.snare] : []), ...(kit.extras ?? []));
    }
  }
  return voices;
}
