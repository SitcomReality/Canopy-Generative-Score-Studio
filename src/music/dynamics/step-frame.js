// Step-frame resolution: which events sound on this 8th-note step, fully from
// the project JSON. Beat (non-degree) layers carry a per-step HIT LIST:
// `steps[i] = [{ piece, at, vel?, pitch? }]` where `at` is an onset fraction
// (0..1) of the step (0 = on-beat, 0.5 = the halfway 16th, 0.25/0.75 = 16ths).
// The `piece` key is meaningful for percussion; for harmony/bass the layer's
// role decides the sound and only `at`/`vel` matter.
import { clamp01 } from "./axes.js";
import { pieceInfo } from "../pieces.js";
import { automationLookup, fillActive, layerActive } from "./gates.js";
import { humanDelay, humanVelocity } from "./humanize.js";

// Tone requires each voice's start times to strictly increase in call order,
// but computeStepFrame's emission order isn't time order (e.g. a variation
// hat drawing a smaller humanize offset than the straight hat before it).
// Stable-sorting ALL events by offset fixes every voice at once: events on
// different voices may interleave in any call order (they hit different
// synths), and stability keeps equal offsets in emission order. Offsets are
// untouched, so seeded determinism holds.
export function orderEvents(events) {
  return [...events].sort((a, b) => (a.offset ?? 0) - (b.offset ?? 0));
}

// Resolve the events this step should play, fully from the project JSON.
// `state` carries per-layer runtime state the hosts maintain:
//   { features: { <layerId>: { steps, resting } } }  // drift/reset phrase, rest gate
// `rng` is a 0..1 source (the engine's current random or a seeded PRNG).
// Returns an array of routed events (each carries `layerId` + `kind`):
//   chord: { kind:"chord", degree, duration, velocity, offset }
//   scale: { kind:"scale", degree, octave, duration, velocity, offset }
//   percussion pieces: { kind:<piece>, piece, velocity, offset, duration,
//                        degree?, octave?, pitch? } (degree/octave for pitched
//                        toms/bongos/keyed/steel/rim; pitch for the kick)
export function computeStepFrame(project, live, state, step, rng) {
  const chordDegree = project.progression[Math.floor(step / 4) % project.progression.length];
  const chordVel = 0.22 + 0.08 * clamp01(live.intensity, 0);
  const resting = state.resting ?? [];
  const events = [];
  const bpm = project.bpm ?? 76;
  // One 8th-note in seconds, so an `at` fraction becomes a real onset time.
  const eighthSec = 60 / bpm / 2;

  for (const layer of project.layers) {
    // A muted layer must NOT be omitted here: it keeps consuming its share of
    // the seeded RNG stream so muting/unmuting one never re-rolls any other
    // layer's subsequent humanize/variation draws. Mute is applied as a gate
    // at the emission boundary (see timing engine), never as a generation
    // skip. Resting and activity gates remain — they are deterministic
    // arrangement decisions, not user toggles.
    if (resting.includes(layer.id)) continue;
    const feat = state.features?.[layer.id];
    const kind = layer.role;
    if (!layerActive(layer, live)) continue;
    const auto = automationLookup(layer, live);
    const av = (param, fallback) => (auto[param] !== undefined ? auto[param] : fallback);
    const hits = Array.isArray(layer.steps[step]) ? layer.steps[step] : [];

    if (kind === "harmony" || kind === "chords") {
      for (const hit of hits) {
        const at = clamp01(Number(hit.at) || 0);
        const offset = at * eighthSec + humanDelay(layer, rng) * 0.4;
        const velocity = humanVelocity(layer, av("velocity", chordVel), rng);
        events.push({
          layerId: layer.id,
          kind: "chord",
          degree: chordDegree,
          duration: av("duration", "1m"),
          velocity,
          offset,
        });
      }
    } else if (kind === "motif" || kind === "melody") {
      const phrase = feat?.steps ?? layer.steps;
      let degree = phrase[step];
      if (degree !== null && rng() < 0.12 * (layer.variation ?? 0) / 100) {
        degree = Math.max(0, Math.min(7, degree + (rng() > 0.5 ? 1 : -1)));
      }
      const density = av("density", (layer.density ?? 100) / 100);
      if (degree === null && rng() < 0.08 * (layer.variation ?? 0) / 100 * density) {
        degree = Math.max(0, Math.min(7, chordDegree + (rng() > 0.5 ? 2 : 4)));
      }
      // Capture the base note's offset: the fill note must land strictly after
      // it on the same voice or Tone rejects the duplicate start time.
      const baseOffset = humanDelay(layer, rng);
      if (degree !== null && rng() < density + 0.24) {
        events.push({
          layerId: layer.id,
          kind: "scale",
          degree,
          octave: Math.round(av("octave", 4)),
          duration: av("duration", "4n"),
          velocity: humanVelocity(layer, av("velocity", 0.4), rng),
          offset: baseOffset,
        });
        if (fillActive(layer, live, step)) {
          events.push({
            layerId: layer.id,
            kind: "scale",
            degree: Math.max(0, Math.min(7, degree + (rng() > 0.5 ? 2 : -2))),
            octave: Math.round(av("octave", 4)),
            duration: "16n",
            velocity: humanVelocity(layer, av("velocity", 0.4), rng),
            offset: baseOffset + 0.04,
          });
        }
      }
    } else if (kind === "bass") {
      const fillPush = fillActive(layer, live, step) && step % 2 === 0;
      for (const hit of hits) {
        const at = clamp01(Number(hit.at) || 0);
        events.push({
          layerId: layer.id,
          kind: "scale",
          degree: chordDegree,
          octave: 2,
          duration: av("duration", "4n"),
          velocity: humanVelocity(layer, av("velocity", 0.45), rng),
          offset: at * eighthSec + humanDelay(layer, rng) * 0.45,
        });
      }
      // A fill push adds a bass note on an empty even step (the original groove
      // kept one note per step; multiple authored hits are all played above).
      if (fillPush && hits.length === 0) {
        events.push({
          layerId: layer.id,
          kind: "scale",
          degree: chordDegree,
          octave: 2,
          duration: av("duration", "4n"),
          velocity: humanVelocity(layer, av("velocity", 0.45), rng),
          offset: humanDelay(layer, rng) * 0.45,
        });
      }
    } else if (kind === "percussion" || kind === "drums") {
      const kickProps = av("kickProps", null);
      const kickPitch = kickProps && typeof kickProps === "object" ? kickProps.midi : "D1";
      const kicked = hits.some((h) => h.piece === "kick");
      // Authored hits: one routed event per piece, positioned by `at`.
      for (const hit of hits) {
        const info = pieceInfo(hit.piece);
        if (!info) continue;
        const at = clamp01(Number(hit.at) || 0);
        // Keep the punchy membrane/drum pads mostly on the grid; let the noise
        // pieces (hat/snare/shaker) swing with the groove's humanize.
        const jitter = info.sound === "membrane" || info.sound === "drum" ? 0.2 : 0.7;
        const entry = {
          layerId: layer.id,
          kind: hit.piece,
          piece: hit.piece,
          velocity: humanVelocity(layer, Math.max(0, Math.min(1, Number(hit.vel) || info.vel)), rng),
          offset: at * eighthSec + humanDelay(layer, rng) * jitter,
          duration: info.dur,
        };
        if (info.sound === "drum" || info.sound === "tone") {
          entry.degree = Math.max(0, Math.min(7, Number.isInteger(hit.pitch) ? hit.pitch : info.degree ?? 0));
          entry.octave = info.octave ?? 4;
        } else if (hit.piece === "kick") {
          entry.pitch = kickPitch;
        }
        events.push(entry);
      }
      // Reactive fills/accents on top of the groove. Snare accents always ride
      // a fill; offsets are fixed (not rng) so seeded determinism holds.
      const snareVel = av("snare.velocity", null);
      if (fillActive(layer, live, step)) {
        events.push({ layerId: layer.id, kind: "snare", piece: "snare", duration: "16n", velocity: snareVel ?? Math.min(1, av("hat.velocity", 0.2) + 0.12), offset: 0.02 });
        if (step % 2 === 1) {
          events.push({ layerId: layer.id, kind: "snare", piece: "snare", duration: "32n", velocity: snareVel ?? 0.24, offset: 0.065 });
          events.push({ layerId: layer.id, kind: "snare", piece: "snare", duration: "32n", velocity: snareVel ?? 0.3, offset: 0.11 });
        }
      }
      // Fill-driven extra kick on an even offbeat, avoiding a downbeat that
      // already sounds a kick (two attacks on one MembraneSynth is a Tone error).
      if (fillActive(layer, live, step) && step % 2 === 0 && !(kicked && step % 4 === 0)) {
        events.push({ layerId: layer.id, kind: "kick", piece: "kick", pitch: kickPitch, duration: "16n", velocity: av("kick.velocity", 0.25), offset: 0 });
      }
      // v5: the half-phrase tail (steps 12-15) always carries a short roll,
      // scaled with intensity instead of gated behind it. Offsets are fixed for
      // seeded determinism; at low intensity a single soft stroke, at high
      // intensity the full rising four-hit roll.
      if (step === 12 || step === 14) {
        const heat = clamp01(live.intensity, 0);
        const base = snareVel ?? 0.2;
        if (heat < 0.34) {
          events.push({ layerId: layer.id, kind: "snare", piece: "snare", duration: "32n", velocity: base * 0.6, offset: 0.18 });
        } else if (heat < 0.67) {
          events.push({ layerId: layer.id, kind: "snare", piece: "snare", duration: "32n", velocity: base * 0.7, offset: 0.16 });
          events.push({ layerId: layer.id, kind: "snare", piece: "snare", duration: "32n", velocity: base * 0.9, offset: 0.21 });
        } else {
          [0.14, 0.18, 0.22, 0.26].forEach((offset, index) => {
            events.push({ layerId: layer.id, kind: "snare", piece: "snare", duration: "32n", velocity: Math.min(1, base + index * 0.09), offset });
          });
        }
      }
      if (rng() < av("hat.variation", 0)) {
        events.push({ layerId: layer.id, kind: "hat", piece: "hat", duration: "32n", velocity: av("hat.velocity", 0.16), offset: humanDelay(layer, rng) * 0.7 });
      }
    }
  }
  return events;
}
