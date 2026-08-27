// Emitted-source part: voice builders. A verbatim flat-file mirror of
// audio/voices.js — pitched synths per role, the serial velocity gain path
// for plucks, and the percussion kit assembled from the preset catalog.
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
function makeDrums(instrument, reverb, glue) {
  // v6: a custom instrument's kit (score.instruments) overrides the catalog.
  const custom = (typeof score !== "undefined") ? (score.instruments?.[instrument]?.percussion) : undefined;
  const preset = custom || instrumentSettings(instrument, "percussion");
  const extras = [];
  const kick = new Tone.MembraneSynth({ ...preset.kick, volume: -10 }).toDestination();
  const hatFilter = preset.hatFilter
    ? new Tone.Filter({ type: "highpass", frequency: preset.hatFilter }).connect(reverb)
    : null;
  const hat = new Tone.NoiseSynth({ ...preset.hat, volume: -24 }).connect(hatFilter || reverb);
  if (hatFilter) extras.push(hatFilter);
  let snare = null;
  if (preset.snare) {
    const snareFilter = preset.snareFilter
      ? new Tone.Filter({ type: "bandpass", frequency: preset.snareFilter, Q: 0.8 }).connect(glue)
      : null;
    snare = new Tone.NoiseSynth({ ...preset.snare, volume: -14 }).connect(snareFilter || glue);
    if (snareFilter) extras.push(snareFilter);
    extras.push(snare);
  }
  return { kind: "drums", kick, hat, snare, extras };
}`;
