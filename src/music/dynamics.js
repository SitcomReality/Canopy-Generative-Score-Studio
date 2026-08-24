// Shared reactive-dynamics decision core (schema v4). This module is the
// single source of truth for *adaptive decisions*: turning a live axis vector
// (intensity/tension/brightness, steered by the game or a context preset)
// into musical parameters and step events. Both the studio preview engine
// (audio/audio-engine.js) and the exported .score.js runtime
// (music/runtime-module.js) use the same logic here.
//
// To keep the emitted .score.js dependency-free (it may only import `tone`),
// runtime-module.js vendors copies of these functions into the emitted file.
// dev/tests/dynamics-parity.test.js guards that the vendored copies never
// drift from this source.
//
// IMPORTANT: every function here is PURE and Tone/DOM-free, and returns scale
// DEGREES (0..7) or null, never absolute midi. The hosts map degrees to
// pitches through their scale wrappers (scaleMidi / the vendored note()), so
// the harmony guard holds everywhere.
import { journeyEnergy } from "./variation.js";

const EPSILON = 1e-9;

export function clamp01(value, fallback = 0.5) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : fallback;
}

// Map a 0..1 axis value onto a two-element numeric domain (linear) or a
// longer domain of strings/numbers (step index). Shared by song-level
// bindings and per-layer automation.
export function domainValue(domain, value) {
  const v = clamp01(value, 0.5);
  if (domain.length === 2 && typeof domain[0] === "number" && typeof domain[1] === "number") {
    return domain[0] + (domain[1] - domain[0]) * v;
  }
  const index = Math.max(0, Math.min(domain.length - 1, Math.round(v * (domain.length - 1))));
  return domain[index];
}

// ---------------------------------------------------------------- contexts

// The axis target vector a context preset steers toward, from the project's
// `contexts` array. Falls back to explore.
export function contextTargets(project, contextId) {
  const preset = (project.contexts ?? []).find((ctx) => ctx.id === contextId);
  return preset ? { ...preset.targets } : { intensity: 0.3, tension: 0.25, brightness: 0.7 };
}

// One smoothing step of a live axis toward a target (hosts call this each bar
// boundary; `rate` = transition speed). Returns a new axis vector.
export function easeToward(live, target, rate = 0.35) {
  const out = {};
  for (const key of ["intensity", "tension", "brightness"]) {
    const from = clamp01(live[key], 0);
    const to = clamp01(target[key], from);
    out[key] = from + (to - from) * rate;
  }
  return out;
}

// ----------------------------------------------------------- song bindings

// Resolve a song-level binding (an axis -> parameter linear/step map) to a
// live value. Returns undefined when no binding targets the given param.
export function bindingValue(project, target, live) {
  const binding = (project.bindings ?? []).find((b) => b.target === target);
  return binding ? domainValue(binding.domain, live[binding.axis]) : undefined;
}

// Current tempo offset derived from the bindings, defaulting to the old
// hardcoded intensity->bpm spread when unbound.
export function tempoOffset(project, live) {
  const bound = bindingValue(project, "tempo.offset", live);
  return bound !== undefined ? bound : live.intensity * 26;
}

// ------------------------------------------------------------ layer gates

// Whether a layer's activity gate currently lets its base pattern sound.
// `live` is the axis vector; activity may be { axis, range } or { from, to }.
export function layerActive(layer, live) {
  const a = layer.activity;
  if (!a) return true;
  const v = a.axis ? clamp01(live[a.axis], 0.5) : Math.max(clamp01(live.intensity, 0), clamp01(live.tension, 0));
  if (a.range) return v >= a.range[0] && v <= a.range[1];
  return v >= a.from && v <= a.to;
}

// Whether the current step is a fill hit (extra notes injected by the layer's
// `fills` when the cited axis crosses its threshold).
export function fillActive(layer, live, step) {
  if (!layer.fills) return false;
  for (const fill of layer.fills) {
    if (!fill.at.includes(step)) continue;
    const threshold = fill.threshold ?? 0.5;
    if (clamp01(live[fill.axis], 0) >= threshold) return true;
  }
  return false;
}

// ----------------------------------------------------------- automation

// Per-layer { param: value } map derived from the layer's automation entries
// and the live axes. Params without automation resolve to undefined (callers
// fall back to the layer default or the hardcoded mid behavior).
export function automationLookup(layer, live) {
  const out = {};
  for (const entry of layer.automation ?? []) {
    out[entry.param] = domainValue(entry.domain, live[entry.axis]);
  }
  return out;
}

// ------------------------------------------------------------------ steps

// Deterministic humanize offset (seconds) from the layer's humanize %.
export function humanDelay(layer, rng) {
  return rng() * (layer.humanize ?? 0) / 100 * 0.035;
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
export function computeStepFrame(project, live, state, step, rng) {
  const chordDegree = project.progression[Math.floor(step / 4) % project.progression.length];
  const chordVel = 0.22 + 0.08 * clamp01(live.intensity, 0);
  const resting = state.resting ?? [];
  const events = [];

  for (const layer of project.layers) {
    if (layer.muted || resting.includes(layer.id)) continue;
    const feat = state.features?.[layer.id];
    const kind = layer.role;
    if (!layerActive(layer, live)) continue;
    const auto = automationLookup(layer, live);
    const av = (param, fallback) => (auto[param] !== undefined ? auto[param] : fallback);

    if (kind === "harmony" || kind === "chords") {
      if (layer.steps[step]) {
        events.push({
          layerId: layer.id,
          kind: "chord",
          degree: chordDegree,
          duration: av("duration", "1m"),
          velocity: av("velocity", chordVel),
          offset: 0,
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
      if (degree !== null && rng() < density + 0.24) {
        events.push({
          layerId: layer.id,
          kind: "scale",
          degree,
          octave: Math.round(av("octave", 4)),
          duration: av("duration", "4n"),
          velocity: av("velocity", 0.4),
          offset: humanDelay(layer, rng),
        });
        if (fillActive(layer, live, step)) {
          events.push({
            layerId: layer.id,
            kind: "scale",
            degree: Math.max(0, Math.min(7, degree + (rng() > 0.5 ? 2 : -2))),
            octave: Math.round(av("octave", 4)),
            duration: "16n",
            velocity: av("velocity", 0.4),
            offset: 0,
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
          velocity: av("velocity", 0.45),
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
      // Higher intensity: fills add off-beat kicks and probabilistic extra hats.
      if (fillPush && step % 2 === 0) {
        events.push({ layerId: layer.id, kind: "kick", pitch, duration: "16n", velocity: av("kick.velocity", 0.25), offset: 0 });
      }
      if (rng() < av("hat.variation", 0)) {
        events.push({ layerId: layer.id, kind: "hat", duration: "32n", velocity: av("hat.velocity", 0.16), offset: humanDelay(layer, rng) * 0.7 });
      }
    }
  }
  return events;
}

// ------------------------------------------------------------- arrangement

// Per-layer volume bias (+/- dB) at a bar boundary from the macro journey
// energy and the layer's energyRole. Kept in the shared core so both engines
// ramp layer gain the same way.
export function journeyGain(layer, energy) {
  const bias = layer.energyRole === "forward" ? 3 : layer.energyRole === "recessive" ? -3 : 1.5;
  return ((energy - 0.5) * 2) * bias;
}

export { journeyEnergy };