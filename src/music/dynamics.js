// Shared reactive-dynamics decision core (schema v5). This module is the
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
// v5 removed tempo modulation; bindings now only serve custom song-level
// parameters, and bpm stays at `project.bpm` for the whole playback.
export function bindingValue(project, target, live) {
  const binding = (project.bindings ?? []).find((b) => b.target === target);
  return binding ? domainValue(binding.domain, live[binding.axis]) : undefined;
}

// ------------------------------------------------------------- verses (v5)

// The section active at an absolute bar count. Sections rotate in order,
// each lasting its `length` bars; a missing/empty list means one implicit
// full-song section (null here — callers treat null as "no overrides").
export function activeSection(project, bar) {
  const sections = project.sections ?? [];
  if (sections.length === 0) return null;
  const total = sections.reduce((sum, section) => sum + Math.max(1, Math.round(section.length ?? 4)), 0);
  let pos = (((bar - 1) % total) + total) % total;
  for (const section of sections) {
    const length = Math.max(1, Math.round(section.length ?? 4));
    if (pos < length) return section;
    pos -= length;
  }
  return sections[sections.length - 1];
}

// Per-layer dB delta for the active section (-24..24, default 0).
export function sectionGain(section, layerId) {
  const gain = section?.layers?.[layerId]?.gain;
  return typeof gain === "number" && Number.isFinite(gain) ? Math.max(-24, Math.min(24, gain)) : 0;
}

// Whether the active section lets the layer sound at all (`active` override).
export function sectionActive(section, layerId) {
  return section?.layers?.[layerId]?.active !== false;
}

// Static per-layer loudness trim in dB (v5 `level`, -24..6, default 0).
export function layerLevel(layer) {
  const level = Number(layer.level);
  return Number.isFinite(level) ? Math.max(-24, Math.min(6, level)) : 0;
}

// -------------------------------------------------------- flourishes (v5)

// One-shot musical events for game milestones: victory/defeat resolve combat;
// combat spikes intensity entering it; calm dissipates intensity neutrally;
// relief releases tension; unease spikes tension anxiously. All events are
// scale DEGREES (harmony guard), scheduled in beat units inside one bar.
const FLOURISH_CATALOG = {
  // Full-bar ascending fanfare that rings into the next bar — triumph.
  victory: [
    { degree: 0, octave: 4, at: 0.0, dur: 0.45, vel: 0.62 },
    { degree: 2, octave: 4, at: 0.5, dur: 0.45, vel: 0.64 },
    { degree: 4, octave: 4, at: 1.0, dur: 0.45, vel: 0.66 },
    { degree: 0, octave: 5, at: 1.5, dur: 0.45, vel: 0.68 },
    { degree: 2, octave: 5, at: 2.0, dur: 0.45, vel: 0.7 },
    { degree: 4, octave: 5, at: 2.5, dur: 0.45, vel: 0.72 },
    { degree: 3, octave: 5, at: 3.0, dur: 0.45, vel: 0.68 },
    { degree: 0, octave: 5, at: 3.5, dur: 1.5, vel: 0.74 },
  ],
  // Slow descending lament sinking to a low long tonic — loss.
  defeat: [
    { degree: 4, octave: 4, at: 0.0, dur: 0.95, vel: 0.5 },
    { degree: 3, octave: 4, at: 1.0, dur: 0.95, vel: 0.46 },
    { degree: 2, octave: 4, at: 2.0, dur: 0.95, vel: 0.42 },
    { degree: 0, octave: 3, at: 3.0, dur: 2.0, vel: 0.44 },
  ],
  // Driving rising stabs — danger arriving, momentum surging.
  combat: [
    { degree: 0, octave: 4, at: 0.0, dur: 0.22, vel: 0.58 },
    { degree: 4, octave: 4, at: 0.25, dur: 0.22, vel: 0.6 },
    { degree: 0, octave: 5, at: 0.5, dur: 0.22, vel: 0.62 },
    { degree: 4, octave: 5, at: 0.75, dur: 0.22, vel: 0.64 },
    { degree: 0, octave: 5, at: 1.0, dur: 0.22, vel: 0.66 },
    { degree: 2, octave: 5, at: 1.5, dur: 0.22, vel: 0.66 },
    { degree: 4, octave: 5, at: 2.0, dur: 0.22, vel: 0.68 },
    { degree: 6, octave: 5, at: 2.5, dur: 0.22, vel: 0.7 },
    { degree: 7, octave: 5, at: 3.0, dur: 0.95, vel: 0.74 },
  ],
  // Sparse falling tones fading out — intensity dissolving without verdict.
  calm: [
    { degree: 4, octave: 4, at: 0.0, dur: 1.4, vel: 0.36 },
    { degree: 2, octave: 4, at: 1.5, dur: 1.4, vel: 0.32 },
    { degree: 0, octave: 4, at: 3.0, dur: 1.8, vel: 0.3 },
  ],
  // A leap up that settles back down — released tension, an exhale.
  relief: [
    { degree: 0, octave: 4, at: 0.0, dur: 0.45, vel: 0.5 },
    { degree: 4, octave: 4, at: 0.5, dur: 0.7, vel: 0.54 },
    { degree: 2, octave: 4, at: 1.5, dur: 0.45, vel: 0.44 },
    { degree: 0, octave: 4, at: 2.0, dur: 1.8, vel: 0.4 },
  ],
  // Skittering stabs against the seventh — something is off.
  unease: [
    { degree: 6, octave: 4, at: 0.0, dur: 0.12, vel: 0.56 },
    { degree: 0, octave: 4, at: 0.25, dur: 0.12, vel: 0.58 },
    { degree: 6, octave: 4, at: 1.5, dur: 0.12, vel: 0.6 },
    { degree: 0, octave: 5, at: 1.75, dur: 0.12, vel: 0.58 },
    { degree: 5, octave: 4, at: 3.0, dur: 0.7, vel: 0.5 },
  ],
};

export const FLOURISH_NAMES = Object.keys(FLOURISH_CATALOG);

// Resolve a flourish by name to normalized events. Per-song overrides in
// project.flourishes[name] win over the catalog; unknown names return [].
// Events stay degree-based so hosts map them through scaleMidi()/note().
export function flourishEvents(project, name) {
  const raw = project.flourishes?.[name] ?? FLOURISH_CATALOG[name];
  if (!Array.isArray(raw)) return [];
  return raw.map((ev) => ({
    degree: Math.max(0, Math.min(7, Math.round(Number(ev.degree ?? 0)) || 0)),
    octave: Math.max(1, Math.min(6, Math.round(Number(ev.octave ?? 5)) || 5)),
    at: Math.max(0, Number(ev.at) || 0),
    dur: Math.max(0.05, Number(ev.dur) || 0.25),
    vel: Math.max(0.05, Math.min(1, Number(ev.vel ?? 0.6))),
  }));
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

// ------------------------------------------------------------- voice order

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
//   snare: { kind:"snare", duration, velocity, offset }  // fill accents/rolls
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
          velocity: av("velocity", 0.4),
          offset: baseOffset,
        });
        if (fillActive(layer, live, step)) {
          events.push({
            layerId: layer.id,
            kind: "scale",
            degree: Math.max(0, Math.min(7, degree + (rng() > 0.5 ? 2 : -2))),
            octave: Math.round(av("octave", 4)),
            duration: "16n",
            velocity: av("velocity", 0.4),
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

// ------------------------------------------------------------- arrangement

// Per-layer volume bias (+/- dB) at a bar boundary from the macro journey
// energy and the layer's energyRole. Kept in the shared core so both engines
// ramp layer gain the same way.
export function journeyGain(layer, energy) {
  const bias = layer.energyRole === "forward" ? 3 : layer.energyRole === "recessive" ? -3 : 1.5;
  return ((energy - 0.5) * 2) * bias;
}

export { journeyEnergy };