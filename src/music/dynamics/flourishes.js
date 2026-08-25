// One-shot flourish catalog (v5): musical events for game milestones.
// victory/defeat resolve combat; combat spikes intensity entering it; calm
// dissipates intensity neutrally; relief releases tension; unease spikes
// tension anxiously. All events are scale DEGREES (harmony guard), scheduled
// in beat units inside one bar.
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
