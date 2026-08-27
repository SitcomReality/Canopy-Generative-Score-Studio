// Pure timing core: the arithmetic half of the studio's single timing
// authority. Tone-free and DOM-free so it runs under node:test with an
// injected clock/ticker. The audio host (./index.js) supplies the real
// Tone.now() and the coarse ticker; nothing here reads the wall clock.
//
// Musical position is a pure function of audio time. A "baseline" captures
// the affine mapping from audio seconds to musical beats:
//
//     musicalPositionAt(t) = musicalOrigin + (t - audioOrigin) * musicalRate
//
// where musicalRate is beats-per-second (bpm / 60). The tuple is always
// { audioOrigin, musicalOrigin, musicalRate } — never just (start, start);
// the slope changes with tempo, so it is part of the state (§5.3 of the
// brief). Counters are never carried forward: position is recomputed from
// the clock every time it is asked.

// Beats per 8th-note step. The score grid is 8n (two steps per beat, 16
// steps per two-bar template).
export const STEPS_PER_BAR = 16;
export const STEPS_PER_BEAT = 2;

// ------------------------- baseline arithmetic ---------------------------

export function createBaseline(audioOrigin, musicalOrigin, musicalRate) {
  return { audioOrigin, musicalOrigin, musicalRate };
}

// Beats-per-second for a BPM value.
export function beatsPerSecond(bpm) {
  return bpm / 60;
}

// Musical position (in beats) at absolute audio-context time `t`.
export function musicalPositionAt(baseline, t) {
  return baseline.musicalOrigin + (t - baseline.audioOrigin) * baseline.musicalRate;
}

// Duration (seconds) of one 8th-note step at the baseline's rate.
export function stepDuration(baseline) {
  return 1 / (baseline.musicalRate * STEPS_PER_BEAT);
}

// The absolute audio-context time at which step `step` (unbounded integer;
// negative for pre-roll) begins, given a baseline anchored at a bar.
export function stepStartTime(baseline, step) {
  return baseline.audioOrigin + (step * stepDuration(baseline));
}

// Canonical on-grid musical position: snap to the nearest step boundary at
// or after `pos` so re-entry always lands on the grid.
export function snappedPosition(pos) {
  return Math.ceil(pos * STEPS_PER_BEAT) / STEPS_PER_BEAT;
}

// Recompute audioOrigin so the mapping passes through (t, pos): used by
// tempo changes, pause/resume and seek so musical position stays continuous.
export function reanchorAt(baseline, t, pos) {
  return createBaseline(t, pos, baseline.musicalRate);
}

// Re-anchor with a new musicalRate (tempo change): keep pos continuous at t.
export function retempoAt(baseline, t, pos, newMusicalRate) {
  return createBaseline(t, pos, newMusicalRate);
}

// ------------------------- position queries ------------------------------

// Decompose a musical position (beats, unbounded) into the score's looping
// frame: { step: 0..15, bar: absolute bar count }. The score is a finite
// 16-step template; the ENGINE owns the loop point via modulo, so layer
// adapters never see a wrap.
export function positionFrame(pos) {
  const floored = Math.floor(pos * STEPS_PER_BEAT); // total steps elapsed
  const bar = Math.floor(floored / STEPS_PER_BAR);
  const step = ((floored % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  return { step, bar };
}

// ------------------------- lookahead window ------------------------------

// Compute the render window [now, now + lookahead]. All grid step-times that
// fall within it (inclusive of `now`) are due this pass. Events are handed
// to voices ahead of time with absolute audio timestamps so main-thread
// jitter can never retime a note.
export function renderWindow(now, lookahead) {
  const end = now + lookahead;
  return { start: now, end };
}

// All step indices whose absolute start time t satisfies start <= t < end.
// Returns ascending integer step indices; negative are permitted so the
// first scheduled note (offset 0) still fires on its exact time rather than
// late. `baseline` provides the rate/origin.
export function dueSteps(baseline, window) {
  const span = stepDuration(baseline);
  const first = Math.floor((window.start - baseline.audioOrigin) / span);
  const last = Math.floor((window.end - baseline.audioOrigin) / span);
  const out = [];
  for (let i = first; i <= last; i += 1) {
    const t = stepStartTime(baseline, i);
    if (t >= window.start) out.push(i);
  }
  return out;
}

// ------------------------- gating ----------------------------------------

// Effective gate for a layer: enabled AND not silenced by another layer's
// solo. Gating is the ONLY thing toggles may affect — it filters at the
// emission boundary and must never alter what events are generated, the
// drawn RNG sequence, or any baseline.
export function effectiveGate(layerId, enabled, soloedId) {
  const soloed = soloedId !== null;
  if (soloed) return layerId === soloedId && enabled;
  return enabled;
}