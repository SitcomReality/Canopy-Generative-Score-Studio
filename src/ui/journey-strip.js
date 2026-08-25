// Journey strip: renders the long-form energy curve (same journeyEnergy the
// engine uses per bar) as a small sparkline in the Long Form song group, with
// a playhead showing where in the cycle playback currently is. The curve only
// rebuilds when the journey definition changes; the bar playhead is moved.
import { journeyEnergy } from "../music/variation.js";
import { renderOn } from "./render-batch.js";

export function initJourneyStrip(store) {
  const root = document.getElementById("journey-strip");
  if (!root) return;

  renderOn(store, ["project"], () => render(root, store.get()));
  renderOn(store, ["bar", "playing"], () => paintPlayhead(root, store.get()));
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

  root.innerHTML = `<svg viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${points}" fill="none" stroke="var(--accent-song)" stroke-width="1.4" vector-effect="non-scaling-stroke" />
    <line class="journey-playhead" x1="0" x2="0" y1="1" y2="25" stroke="var(--accent)" stroke-width="1.5" vector-effect="non-scaling-stroke" hidden />
  </svg>`;
  paintPlayhead(root, state);
}

// Playhead phase matches the engine: (bar % length) / length.
function paintPlayhead(root, state) {
  const journey = state.project.journey ?? { shape: "flat", length: 16, depth: 0 };
  const length = Math.max(2, journey.length ?? 16);
  const phase = (((state.bar ?? 0) % length) / length) * 100;
  const line = root.querySelector(".journey-playhead");
  if (!line) return;
  line.hidden = !state.playing;
  line.setAttribute("x1", phase.toFixed(2));
  line.setAttribute("x2", phase.toFixed(2));
}
