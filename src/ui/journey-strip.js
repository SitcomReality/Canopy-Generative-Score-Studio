// Journey strip: renders the long-form energy curve (same journeyEnergy the
// engine uses per bar) as a small sparkline in the Long Form song group, with
// a playhead showing where in the cycle playback currently is.
import { journeyEnergy } from "../music/variation.js";

export function initJourneyStrip(store) {
  const root = document.getElementById("journey-strip");
  if (!root) return;

  store.subscribe((changed) => {
    if (changed.includes("project") || changed.includes("bar") || changed.includes("playing")) render(root, store.get());
  });
  render(root, store.get());
}

function render(root, state) {
  const journey = state.project.journey ?? { shape: "flat", length: 16, depth: 0 };
  const length = Math.max(2, journey.length ?? 16);
  const points = Array.from({ length }, (_, index) => {
    // The engine computes each bar's energy with its (already incremented)
    // bar counter, so sample 1..length to draw exactly what will sound.
    const energy = journeyEnergy(journey.shape, journey.depth ?? 0, index + 1, length);
    return `${((index / (length - 1)) * 100).toFixed(2)},${(24 - energy * 22).toFixed(2)}`;
  }).join(" ");

  // Playhead phase matches the engine: (bar % length) / length.
  const phase = (((state.bar ?? 0) % length) / length) * 100;
  root.innerHTML = `<svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${points}" fill="none" stroke="var(--accent-song)" stroke-width="1.4" vector-effect="non-scaling-stroke" />
    ${state.playing ? `<line x1="${phase.toFixed(2)}" x2="${phase.toFixed(2)}" y1="1" y2="25" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" />` : ""}
  </svg>`;
}
