// Step-frame resolution: which events sound on this 16th-of-a-bar step.
import { clamp01 } from "./axes.js";
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
// Returns an array of events; each is:
//   chord: { kind:"chord", degree, duration, velocity }
//   scale: { kind:"scale", degree, octave, duration, velocity, offset }
//   kick:  { kind:"kick", duration, velocity }
//   hat:   { kind:"hat", duration, velocity }
//   snare: { kind:"snare", duration, velocity, offset }  // fill accents/rolls
export function computeStepFrame(project, live, state, step, rng) {
  const chordDegree = project.progression[Math.floor(step / 4) % project.progression.length];
  const chordVel = 0.22 + 0.08 * clamp01(live.intensity, 0);
  const resting = state.resting ?? [];
  const events = [];

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

    if (kind === "harmony" || kind === "chords") {
      if (layer.steps[step]) {
        // Capture the chord's humanize draw before jitter so both use one
        // deterministic rng sample pair per hit.
        const offset = humanDelay(layer, rng) * 0.4;
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
      const straight = layer.steps[step];
      const fillPush = fillActive(layer, live, step) && step % 2 === 0;
      if (straight || fillPush) {
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
      const hit = !!layer.steps[step];
      const isDownbeat = step % 4 === 0;
      const fillPush = fillActive(layer, live, step);
      const kickProps = av("kickProps", null);
      const pitch = kickProps && typeof kickProps === "object" ? kickProps.midi : "D1";
      // Kick on structural downbeats (and fill-driven extra kicks on offbeats).
      if (hit && isDownbeat) {
        events.push({ layerId: layer.id, kind: "kick", pitch, duration: "16n", velocity: av("kick.velocity", 0.25), offset: 0 });
      }
      if (hit && !isDownbeat) {
        events.push({ layerId: layer.id, kind: "hat", duration: "32n", velocity: av("hat.velocity", 0.16), offset: humanDelay(layer, rng) * 0.7 });
      }
      // Higher intensity: fills add off-beat kicks and probabilistic extra
      // hats. Skip the fill kick when the straight downbeat kick already fired
      // — two attacks on one MembraneSynth at the same time is a Tone error.
      if (fillPush && step % 2 === 0 && !(hit && isDownbeat)) {
        events.push({ layerId: layer.id, kind: "kick", pitch, duration: "16n", velocity: av("kick.velocity", 0.25), offset: 0 });
      }
      // Fills also add snare accents; late-phrase fill steps close with a
      // short rising roll so transitions into the next half feel played, not
      // switched. Offsets are fixed (not rng) to keep seeded determinism, and
      // start slightly off the grid so a kit without a dedicated snare (the
      // accent falls back to the hat synth) never collides with the hat hit.
      const snareVel = av("snare.velocity", null);
      if (fillPush) {
        events.push({ layerId: layer.id, kind: "snare", duration: "16n", velocity: snareVel ?? Math.min(1, av("hat.velocity", 0.2) + 0.12), offset: 0.02 });
        if (step % 2 === 1) {
          events.push({ layerId: layer.id, kind: "snare", duration: "32n", velocity: snareVel ?? 0.24, offset: 0.065 });
          events.push({ layerId: layer.id, kind: "snare", duration: "32n", velocity: snareVel ?? 0.3, offset: 0.11 });
        }
      }
      // v5: the half-phrase tail (steps 12-15) always carries a short roll,
      // scaled with intensity instead of gated behind it, so the roll timbre
      // is a regular part of the groove rather than an occasional surprise
      // burst. Offsets are fixed for seeded determinism; at low intensity a
      // single soft stroke, at high intensity the full rising four-hit roll.
      if (step === 12 || step === 14) {
        const heat = clamp01(live.intensity, 0);
        const base = snareVel ?? 0.2;
        if (heat < 0.34) {
          events.push({ layerId: layer.id, kind: "snare", duration: "32n", velocity: base * 0.6, offset: 0.18 });
        } else if (heat < 0.67) {
          events.push({ layerId: layer.id, kind: "snare", duration: "32n", velocity: base * 0.7, offset: 0.16 });
          events.push({ layerId: layer.id, kind: "snare", duration: "32n", velocity: base * 0.9, offset: 0.21 });
        } else {
          [0.14, 0.18, 0.22, 0.26].forEach((offset, index) => {
            events.push({ layerId: layer.id, kind: "snare", duration: "32n", velocity: Math.min(1, base + index * 0.09), offset });
          });
        }
      }
      if (rng() < av("hat.variation", 0)) {
        events.push({ layerId: layer.id, kind: "hat", duration: "32n", velocity: av("hat.velocity", 0.16), offset: humanDelay(layer, rng) * 0.7 });
      }
    }
  }
  return events;
}
