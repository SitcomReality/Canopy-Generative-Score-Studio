// Axis plumbing for the reactive-dynamics core: clamping, domain mapping,
// context targets, easing, and song-level bindings.
export const EPSILON = 1e-9;

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

// ------------------------------------------------- atmosphere bindings

// Song-level "shared atmosphere" params a binding may drive. These are global
// (not owned by a single layer), so they use song-level bindings rather than
// per-layer automation. Units match the project fields: reverb & swing are 0..100
// (percent), space.* are 0..1 (parallel reverb/echo send levels).
export const ATMOSPHERE_TARGETS = ["reverb", "space.lead", "space.bed", "space.bass", "space.echo", "swing"];

// Resolve the song-level bindings that target atmosphere params against a live
// axis vector. Returns { reverb?, swing?, space: { lead?, bed?, bass?, echo? } }
// with ONLY the params that actually have a binding; the rest are undefined so
// consumers fall back to the song's static baseline for that param (and leave
// an unbound param untouched). Unknown/non-atmosphere targets are ignored.
export function atmosphereBindings(project, live) {
  const out = { reverb: undefined, swing: undefined, space: {} };
  for (const key of ["lead", "bed", "bass", "echo"]) {
    const value = bindingValue(project, `space.${key}`, live);
    if (value !== undefined) out.space[key] = value;
  }
  const reverb = bindingValue(project, "reverb", live);
  if (reverb !== undefined) out.reverb = reverb;
  const swing = bindingValue(project, "swing", live);
  if (swing !== undefined) out.swing = swing;
  return out;
}
