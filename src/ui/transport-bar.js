// Transport bar: project identity, play/stop, bar/beat readout, tempo/key/scale.
import { KEYS } from "../music/keys.js";
import { SCALES } from "../music/scales.js";
import { getTimingEngine } from "../timing/index.js";
import { iconSvg, mountIcons } from "./icons.js";

export function initTransportBar(store, actions) {
  const keySelect = document.getElementById("key-select");
  KEYS.forEach((key) => keySelect.add(new Option(key, key)));
  const scaleSelect = document.getElementById("scale-select");
  Object.keys(SCALES).forEach((scale) => scaleSelect.add(new Option(scale, scale)));

  document.getElementById("project-name").addEventListener("input", (event) => actions.renameProject(event.target.value));
  document.getElementById("play-button").addEventListener("click", actions.togglePlayback);
  document.getElementById("stop-button").addEventListener("click", actions.stopPlayback);
  document.getElementById("record-button").addEventListener("click", actions.toggleRecording);
  // Elapsed-time readout while recording.
  let recordTimer = null;
  store.subscribe((changed) => {
    const recording = store.get().recording;
    if (!changed.includes("recording") && !recording) return;
    const button = document.getElementById("record-button");
    const timeLabel = document.getElementById("record-time");
    button.classList.toggle("recording", recording);
    button.setAttribute("aria-label", recording ? "Stop recording" : "Record");
    mountIcons(button);
    timeLabel.hidden = !recording;
    getTimingEngine().clearInterval(recordTimer);
    if (recording) {
      // Elapsed readout uses the shared engine's clock and a timer-task, so
      // the app still has exactly one timing authority + one ticker.
      const startedAt = getTimingEngine().audioNow();
      const tick = () => {
        const seconds = Math.floor(getTimingEngine().audioNow() - startedAt);
        timeLabel.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      };
      tick();
      recordTimer = getTimingEngine().setInterval(tick, 500);
    }
  });
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
