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

// Build the percussion kit for one layer. A kit exposes one Tone node per
// piece family, keyed in `.kit` by the piece names the dynamics core emits
// (kick / rim / hat / hat-open / snare / tom-hi / tom-lo / bongo-hi /
// bongo-lo / keyed / steel / shaker). Every node is tagged with `.drumKind`
// ("membrane" | "synth" | "noise") so the dispatcher knows its trigger
// signature, plus `.drumName` for the strict-increase voice group. `kick`,
// `hat` and `snare` are also aliased on the returned bundle because the
// bar-boundary loudness deltas ramp them (see arrangement.js). A custom
// instrument's kit (project instruments) overrides the catalog preset.
export function makeDrums(instrument, targets, project = {}) {
  const custom = project.instruments?.[instrument]?.percussion;
  const preset = custom ?? instrumentSettings(instrument, "percussion");
  const extras = [];
  const room = targets.room ?? targets.reverb;
  const tonal = targets.tonal ?? targets.glue;

  const kick = new Tone.MembraneSynth({ ...preset.kick, volume: -10 }).connect(targets.kick);
  kick.drumKind = "membrane";
  kick.drumName = "kick";
  kick.baseVolume = -10;

  // One tuneable pitched membranophone for toms/bongos.
  const drum = new Tone.MembraneSynth({
    pitchDecay: 0.004,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.26, sustain: 0, release: 0.12 },
    volume: -18,
  }).connect(room);
  drum.drumKind = "membrane";
  drum.drumName = "drum";
  drum.baseVolume = -18;

  // One short pitched voice for keyed/steel/rim (in-key metallic/tuned tones).
  const tone = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.2 },
    volume: -18,
  }).connect(tonal);
  tone.drumKind = "synth";
  tone.drumName = "tone";
  tone.baseVolume = -18;

  const hatFilter = preset.hatFilter
    ? new Tone.Filter({ type: "highpass", frequency: preset.hatFilter }).connect(targets.hat)
    : null;
  const hat = new Tone.NoiseSynth({ ...preset.hat, volume: -24 }).connect(hatFilter ?? targets.hat);
  hat.drumKind = "noise";
  hat.drumName = "hat";
  hat.baseVolume = -24;
  if (hatFilter) extras.push(hatFilter);

  const hatOpen = new Tone.NoiseSynth({
    ...preset.hat,
    envelope: { ...(preset.hat?.envelope ?? {}), decay: 0.28, release: 0.24 },
    volume: -24,
  }).connect(hatFilter ?? targets.hat);
  hatOpen.drumKind = "noise";
  hatOpen.drumName = "hat-open";
  hatOpen.baseVolume = -24;

  const shaker = new Tone.NoiseSynth({ ...preset.hat, volume: -28 }).connect(hatFilter ?? targets.hat);
  shaker.drumKind = "noise";
  shaker.drumName = "shaker";
  shaker.baseVolume = -28;

  let snare = null;
  if (preset.snare) {
    const snareFilter = preset.snareFilter
      ? new Tone.Filter({ type: "bandpass", frequency: preset.snareFilter, Q: 0.8 }).connect(targets.snare)
      : null;
    snare = new Tone.NoiseSynth({ ...preset.snare, volume: -14 }).connect(snareFilter ?? targets.snare);
    snare.drumKind = "noise";
    snare.drumName = "snare";
    snare.baseVolume = -14;
    if (snareFilter) extras.push(snareFilter);
  }

  const kit = { kick, drum, tone, hat, "hat-open": hatOpen, shaker, ...(snare ? { snare } : {}) };
  const nodes = [kick, drum, tone, hat, hatOpen, shaker, ...(snare ? [snare] : [])];
  // Alias kick/hat/snare on the bundle so bar-boundary loudness ramps find them.
  return { kind: "drums", kit, kick, hat, snare, nodes, extras };
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
      const kit = makeDrums(layer.instrument, { kick: buses.dry, hat: buses.reverb, snare: buses.glue, room: buses.reverb, tonal: buses.glue }, project);
      voices[layer.id] = kit;
      disposables.push(...(kit.nodes ?? []), ...(kit.extras ?? []));
    }
  }
  return voices;
}
