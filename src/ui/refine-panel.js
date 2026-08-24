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
  const journeyDepthSlider = createParameterSlider(document.getElementById("slider-depth"), { label: "Journey strength", low: "Subtle", high: "Dramatic", onChange: (value) => actions.setJourney({ depth: value }) });

  const restWindowSelect = document.getElementById("rest-window-select");
  restWindowSelect.addEventListener("change", (event) => actions.setParameter("restWindow", Number(event.target.value)));

  const journeyShapeSelect = document.getElementById("journey-shape-select");
  journeyShapeSelect.addEventListener("change", (event) => actions.setJourney({ shape: event.target.value }));

  const journeyLengthSelect = document.getElementById("journey-length-select");
  journeyLengthSelect.addEventListener("change", (event) => actions.setJourney({ length: Number(event.target.value) }));

  const seedInput = document.getElementById("variation-seed-input");
  seedInput.addEventListener("change", () => actions.setVariationSeed(Number(seedInput.value)));

  // Layer name editing: commit on blur or Enter.
  const nameInput = document.getElementById("refine-track-name");
  nameInput.addEventListener("change", () => actions.renameLayer(selectedLayerId, nameInput.value));
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") nameInput.blur();
  });

  let selectedLayerId = null;

  const progressionSelect = document.getElementById("progression-select");
  PROGRESSIONS.forEach((item) => progressionSelect.add(new Option(item.name, item.name)));
  progressionSelect.addEventListener("change", (event) => actions.setProgression(event.target.value));

  function paintLayer(project, trackId) {
    const layer = project.layers.find((item) => item.id === trackId) ?? project.layers[0];
    selectedLayerId = layer.id;
    Object.keys(layerSliders).forEach((key) => layerSliders[key].set(layer[key]));
    restWindowSelect.value = String(layer.restWindow ?? 0);
    if (document.activeElement !== nameInput) nameInput.value = layer.name;
  }

  function paintShared(project) {
    Object.keys(sharedSliders).forEach((key) => sharedSliders[key].set(project[key]));
    progressionSelect.value = project.progressionName;
    journeyShapeSelect.value = project.journey?.shape ?? "flat";
    journeyLengthSelect.value = String(project.journey?.length ?? 16);
    journeyDepthSlider.set(project.journey?.depth ?? 0);
    if (document.activeElement !== seedInput) seedInput.value = String(project.variationSeed ?? 0);
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
