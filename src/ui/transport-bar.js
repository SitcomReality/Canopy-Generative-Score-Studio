// Transport bar: project identity, play/stop, bar/beat readout, tempo/key/scale.
import { KEYS } from "../music/keys.js";
import { SCALES } from "../music/scales.js";
import { iconSvg, mountIcons } from "./icons.js";

export function initTransportBar(store, actions) {
  const keySelect = document.getElementById("key-select");
  KEYS.forEach((key) => keySelect.add(new Option(key, key)));
  const scaleSelect = document.getElementById("scale-select");
  Object.keys(SCALES).forEach((scale) => scaleSelect.add(new Option(scale, scale)));

  document.getElementById("project-name").addEventListener("input", (event) => actions.renameProject(event.target.value));
  document.getElementById("play-button").addEventListener("click", actions.togglePlayback);
  document.getElementById("stop-button").addEventListener("click", actions.stopPlayback);
  document.getElementById("bpm-input").addEventListener("change", (event) => actions.setBpm(Number(event.target.value)));
  keySelect.addEventListener("change", (event) => actions.setKey(event.target.value));
  scaleSelect.addEventListener("change", (event) => actions.setScale(event.target.value));

  store.subscribe((changed) => {
    const { project, playing, step } = store.get();
    if (changed.includes("project")) {
      const nameInput = document.getElementById("project-name");
      if (document.activeElement !== nameInput) nameInput.value = project.name;
      if (document.activeElement !== document.getElementById("bpm-input")) document.getElementById("bpm-input").value = String(project.bpm);
      keySelect.value = project.key;
      scaleSelect.value = project.scale;
    }
    if (changed.includes("playing") || changed.includes("tab")) {
      document.getElementById("play-button").innerHTML = iconSvg(playing ? "pause" : "play", 19);
      document.getElementById("play-button").setAttribute("aria-label", playing ? "Pause" : "Play");
      mountIcons(document.getElementById("play-button"));
    }
    if (changed.includes("step") || changed.includes("playing")) {
      document.getElementById("readout-bar").textContent = String(Math.floor(step / 8) + 1).padStart(2, "0");
      document.getElementById("readout-beat").textContent = String(Math.floor((step % 8) / 2) + 1).padStart(2, "0");
      document.getElementById("transport-readout").classList.toggle("running", playing);
    }
  });

  // Initial paint for values with no prior change event.
  const { project } = store.get();
  document.getElementById("project-name").value = project.name;
  document.getElementById("bpm-input").value = String(project.bpm);
  keySelect.value = project.key;
  scaleSelect.value = project.scale;
  document.getElementById("play-button").innerHTML = iconSvg("play", 19);
  mountIcons(document.getElementById("play-button"));
}
