// Refine panel: voice character, per-layer parameter sliders, shared
// atmosphere sliders, chord-path preset selector with roman numerals.
import { PROGRESSIONS } from "../music/progressions.js";
import { ROMAN_NUMERALS } from "../music/progressions.js";
import { createParameterSlider } from "./parameter-slider.js";

export function initRefinePanel(store, actions) {
  const sliders = {
    density: createParameterSlider(document.getElementById("slider-density"), { label: "Note density", low: "Airy", high: "Busy", onChange: (density) => actions.setParameter("density", density) }),
    variation: createParameterSlider(document.getElementById("slider-variation"), { label: "Safe variation", low: "Repeat", high: "Evolve", onChange: (variation) => actions.setParameter("variation", variation) }),
    humanize: createParameterSlider(document.getElementById("slider-humanize"), { label: "Human feel", low: "Exact", high: "Loose", onChange: (humanize) => actions.setParameter("humanize", humanize) }),
    reverb: createParameterSlider(document.getElementById("slider-reverb"), { label: "Reverb space", low: "Close", high: "Vast", onChange: (reverb) => actions.setParameter("reverb", reverb) }),
    swing: createParameterSlider(document.getElementById("slider-swing"), { label: "Rhythmic sway", low: "Straight", high: "Sway", onChange: (swing) => actions.setParameter("swing", swing) }),
  };

  document.getElementById("instrument-select").addEventListener("change", (event) => actions.setInstrument(event.target.value));

  const progressionSelect = document.getElementById("progression-select");
  PROGRESSIONS.forEach((item) => progressionSelect.add(new Option(item.name, item.name)));
  progressionSelect.addEventListener("change", (event) => actions.setProgression(event.target.value));

  store.subscribe((changed) => {
    const { project } = store.get();
    if (!changed.includes("project")) return;
    Object.keys(sliders).forEach((key) => sliders[key].set(project[key]));
    document.getElementById("instrument-select").value = project.instrument;
    progressionSelect.value = project.progressionName;
    document.getElementById("roman-progression").innerHTML =
      project.progression.map((degree) => `<span>${ROMAN_NUMERALS[degree] ?? degree + 1}</span>`).join("");
  });

  // Initial paint.
  const { project } = store.get();
  Object.keys(sliders).forEach((key) => sliders[key].set(project[key]));
  document.getElementById("instrument-select").value = project.instrument;
  progressionSelect.value = project.progressionName;
  document.getElementById("roman-progression").innerHTML =
    project.progression.map((degree) => `<span>${ROMAN_NUMERALS[degree] ?? degree + 1}</span>`).join("");
}
