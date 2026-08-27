// Emitted-source part: voice builders. A verbatim flat-file mirror of
// audio/voices.js — pitched synths per role, the serial velocity gain path
// for plucks, and the percussion kit (one node per piece family) assembled
// from the preset catalog. Kept behaviorally identical to the studio mirror.
export const VOICE_BUILDERS_SRC = `// ---- voice builders (mirror of audio-engine/voices.js) -------------------
const ROLE_VOLUME = { melody: -9, chords: -13, bass: -11 };
function makePitched(roleKey, cfg) {
  const { voice, pluck, ...options } = cfg;
  if (voice === "pluck") return new Tone.PluckSynth({ ...(pluck || {}), volume: ROLE_VOLUME[roleKey] });
  if (voice === "fm") return new Tone.PolySynth(Tone.FMSynth).set({ ...options, volume: ROLE_VOLUME[roleKey] });
  return new Tone.PolySynth(Tone.Synth).set({ ...options, volume: ROLE_VOLUME[roleKey] });
}
// PluckSynth has no velocity parameter; a serial gain node carries each
// note's velocity instead (mirror of voices.js makeVelocityPath).
function makeVelocityPath(synth, connectTo, baseGain) {
  const velGain = new Tone.Gain(baseGain === undefined ? 1 : baseGain);
  synth.disconnect();
  synth.connect(velGain);
  velGain.connect(connectTo);
  velGain.baseGain = baseGain === undefined ? 1 : baseGain;
  return { synth, velGain };
}
function makeDrums(instrument, reverb, glue, activeScore) {
  // v6: a custom instrument's kit (score.instruments) overrides the catalog.
  const custom = activeScore?.instruments?.[instrument]?.percussion;
  const preset = custom || instrumentSettings(instrument, "percussion");
  const extras = [];
  // Kick: pitched membrane thud (fixed pitch, from automation or the default).
  const kick = new Tone.MembraneSynth({ ...preset.kick, volume: -10 }).toDestination();
  kick.drumKind = "membrane";
  kick.drumName = "kick";
  kick.baseVolume = -10;
  // Toms/bongos share one tuneable pitched membrane voice.
  const drum = new Tone.MembraneSynth({
    pitchDecay: 0.004,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.26, sustain: 0, release: 0.12 },
    volume: -18,
  }).connect(reverb);
  drum.drumKind = "membrane";
  drum.drumName = "drum";
  drum.baseVolume = -18;
  // Keyed/steel/rim share one short pitched metallic voice.
  const tone = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.2 },
    volume: -18,
  }).connect(glue);
  tone.drumKind = "synth";
  tone.drumName = "tone";
  tone.baseVolume = -18;
  // Bright noise family (hat / hat-open / shaker), high-passed.
  const hatFilter = preset.hatFilter
    ? new Tone.Filter({ type: "highpass", frequency: preset.hatFilter }).connect(reverb)
    : null;
  const hat = new Tone.NoiseSynth({ ...preset.hat, volume: -24 }).connect(hatFilter || reverb);
  hat.drumKind = "noise";
  hat.drumName = "hat";
  hat.baseVolume = -24;
  if (hatFilter) extras.push(hatFilter);
  const hatOpen = new Tone.NoiseSynth({
    ...preset.hat,
    envelope: { ...(preset.hat && preset.hat.envelope), decay: 0.28, release: 0.24 },
    volume: -24,
  }).connect(hatFilter || reverb);
  hatOpen.drumKind = "noise";
  hatOpen.drumName = "hat-open";
  hatOpen.baseVolume = -24;
  const shaker = new Tone.NoiseSynth({ ...preset.hat, volume: -28 }).connect(hatFilter || reverb);
  shaker.drumKind = "noise";
  shaker.drumName = "shaker";
  shaker.baseVolume = -28;
  let snare = null;
  if (preset.snare) {
    const snareFilter = preset.snareFilter
      ? new Tone.Filter({ type: "bandpass", frequency: preset.snareFilter, Q: 0.8 }).connect(glue)
      : null;
    snare = new Tone.NoiseSynth({ ...preset.snare, volume: -14 }).connect(snareFilter || glue);
    snare.drumKind = "noise";
    snare.drumName = "snare";
    snare.baseVolume = -14;
    if (snareFilter) extras.push(snareFilter);
  }
  const kit = { kick, drum, tone, hat, "hat-open": hatOpen, shaker, ...(snare ? { snare } : {}) };
  const nodes = [kick, drum, tone, hat, hatOpen, shaker, ...(snare ? [snare] : [])];
  return { kind: "drums", kit, kick, hat, snare, nodes, extras };
}`;
