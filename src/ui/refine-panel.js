// Refine panel: per-layer controls for the selected layer (voice character,
// note density, safe variation, human feel) and song-level shared controls
// (reverb, rhythmic sway, chord path with roman numerals).
import { PROGRESSIONS, ROMAN_NUMERALS } from "../music/progressions.js";
import { createParameterSlider } from "./parameter-slider.js";

export function initRefinePanel(store, actions) {
  const layerSliders = {
    density: createParameterSlider(document.getElementById("slider-density"), { label: "Note density", low: "Airy", high: "Busy", onChange: (value) => actions.setParameter("density", value) }),
    variation: createParameterSlider(document.getElementById("slider-variation"), { label: "Safe variation", low: "Repeat", high: "Evolve", onChange: (value) => actions.setParameter("variation", value) }),
    humanize: createParameterSlider(document.getElementById("slider-humanize"), { label: "Human feel", low: "Exact", high: "Loose", onChange: (value) => actions.setParameter("humanize", value) }),
  };
  const sharedSliders = {
    reverb: createParameterSlider(document.getElementById("slider-reverb"), { label: "Reverb space", low: "Close", high: "Vast", onChange: (value) => actions.setParameter("reverb", value) }),
    swing: createParameterSlider(document.getElementById("slider-swing"), { label: "Rhythmic sway", low: "Straight", high: "Sway", onChange: (value) => actions.setParameter("swing", value) }),
  };

  const instrumentSelect = document.getElementById("instrument-select");
  instrumentSelect.addEventListener("change", (event) => actions.setInstrument(event.target.value));

  const progressionSelect = document.getElementById("progression-select");
  PROGRESSIONS.forEach((item) => progressionSelect.add(new Option(item.name, item.name)));
  progressionSelect.addEventListener("change", (event) => actions.setProgression(event.target.value));

  function paintLayer(project, selectedTrack) {
    const layer = project.layers.find((item) => item.id === selectedTrack) ?? project.layers[0];
    Object.keys(layerSliders).forEach((key) => layerSliders[key].set(layer[key]));
    instrumentSelect.value = layer.instrument;
  }

  function paintShared(project) {
    Object.keys(sharedSliders).forEach((key) => sharedSliders[key].set(project[key]));
    progressionSelect.value = project.progressionName;
    document.getElementById("roman-progression").innerHTML =
      project.progression.map((degree) => `<span>${ROMAN_NUMERALS[degree] ?? degree + 1}</span>`).join("");
  }

  store.subscribe((changed) => {
    const { project, selectedTrack } = store.get();
    if (changed.includes("project") || changed.includes("selectedTrack")) paintLayer(project, selectedTrack);
    if (changed.includes("project")) paintShared(project);
  });

  // Initial paint.
  const { project, selectedTrack } = store.get();
  paintLayer(project, selectedTrack);
  paintShared(project);
}
