// Voice builders: turn an instrument preset config into live Tone nodes, one
// bundle per layer. Mirrored (as emitted source text) by
// music/runtime-module.js — keep the two behaviorally identical.
import { instrumentSettings } from "../music/instruments.js";
import { resolveInstrumentConfig } from "../music/instrument-override.js";

// Per-kind base loudness in dB for pitched voices.
export const ROLE_VOLUME = { melody: -9, chords: -13, bass: -11 };

// A bounded per-layer PolySynth voice cap so no pitched layer can strand a huge
// pool of simultaneous voices. Tone's default is 32; bounding it keeps a dense
// layer's active voices in check (it steals the oldest masked note instead of
// growing), which is friendlier to low-end systems. The global mix budget lives
// in audio/sequencer/polyphony.js; this is the per-layer safety bound.
const POLYPHONY_CAP = { melody: 16, chords: 12, bass: 1 };

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
    return new Tone.PolySynth(Tone.FMSynth)
      .set({ ...options, volume: ROLE_VOLUME[roleKey], maxPolyphony: POLYPHONY_CAP[roleKey] ?? 16 });
  }
  return new Tone.PolySynth(Tone.Synth)
    .set({ ...options, volume: ROLE_VOLUME[roleKey], maxPolyphony: POLYPHONY_CAP[roleKey] ?? 16 });
}

// Build the percussion kit for one layer. Targets decide where each drum
// lands in the graph (the studio routes into buses; the runtime template
// connects straight to destinations). A custom instrument's kit (project
// instruments) overrides the catalog preset.
export function makeDrums(instrument, targets, project = {}) {
  const custom = project.instruments?.[instrument]?.percussion;
  const preset = custom ?? instrumentSettings(instrument, "percussion");
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

// Build the pitched voice bundle for one layer (motif/harmony/bass roles;
// percussion layers return null — use makeDrums). Every Tone node the bundle
// owns is listed in `.nodes` so live swaps can dispose exactly what they
// replaced, and `voiceClass` records which synth family is live so the
// engine knows when an instrument change needs a rebuild vs a .set().
export function createLayerVoice(layer, buses, disposables, project = {}) {
  let kind, bus, roleKey, cfg;
  if (layer.role === "harmony") {
    kind = "chords";
    roleKey = "chords";
    bus = buses.harmony;
    cfg = resolveInstrumentConfig(layer, "harmony", project);
  } else if (layer.role === "motif") {
    kind = "melody";
    roleKey = "melody";
    bus = buses.motif;
    cfg = resolveInstrumentConfig(layer, "motif", project);
  } else if (layer.role === "bass") {
    kind = "bass";
    roleKey = "bass";
    bus = buses.bass ?? buses.dry;
    cfg = resolveInstrumentConfig(layer, "bass", project);
  } else {
    return null;
  }

  const voiceClass = cfg.voice === "pluck" ? "pluck" : cfg.voice === "fm" ? "fm" : "synth";
  let bundle;
  if (cfg.voice === "pluck") {
    const synth = makePitched(roleKey, cfg);
    // PluckSynth ignores its options.volume; bass keeps its role trim on the
    // velocity path instead.
    const baseGain = kind === "bass" ? Math.pow(10, ROLE_VOLUME.bass / 20) : 1;
    bundle = { kind, voiceClass, ...makeVelocityPath(synth, bus, disposables, baseGain) };
    bundle.nodes = [synth, bundle.velGain];
  } else if (kind === "bass") {
    const synth = new Tone.MonoSynth({ ...cfg, volume: ROLE_VOLUME.bass });
    synth.connect(bus);
    bundle = { kind, voiceClass, synth };
    bundle.nodes = [synth];
  } else {
    const synth = makePitched(roleKey, cfg);
    synth.connect(bus);
    bundle = { kind, voiceClass, synth };
    bundle.nodes = [synth];
  }
  disposables.push(...bundle.nodes);
  return bundle;
}

// One voice bundle per layer, keyed by layer id. Layers added later rebuild
// the engine, so this map always mirrors the project's layers at construction
// time.
export function createVoices(project, buses, disposables) {
  const voices = {};
  for (const layer of project.layers) {
    const bundle = createLayerVoice(layer, buses, disposables, project);
    if (bundle) {
      voices[layer.id] = bundle;
    } else if (layer.role === "percussion") {
      const kit = makeDrums(layer.instrument, { kick: buses.dry, hat: buses.reverb, snare: buses.glue });
      voices[layer.id] = kit;
      disposables.push(kit.kick, kit.hat, ...(kit.snare ? [kit.snare] : []), ...(kit.extras ?? []));
    }
  }
  return voices;
}
