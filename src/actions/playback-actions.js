// Transport and adaptive-performance actions: play/pause/stop, live-take
// recording, direct axis-target steering, and the starter-score reset.
import { hydrateProject } from "../music/default-project.js";
import { startRecording, stopRecording, isRecording } from "../audio/recorder.js";
import { encodeWav } from "../utils/wav.js";
import { encodeMp3 } from "../utils/mp3.js";
import { downloadBlob, safeFileName } from "../utils/download.js";
import { notify } from "../ui/toast.js";

export function createPlaybackActions(store, host) {
  const api = {
    async togglePlayback() {
      await Tone.start();
      host.initialize();
      const playing = !store.get().playing;
      if (playing) host.engine.play();
      else host.engine.pause();
      store.set({ playing });
    },

    stopPlayback() {
      if (host.engine) host.engine.stop();
      else store.set({ step: 0 });
      store.set({ playing: false });
    },

    // Jump the loop position to a specific step (0..15) within the 2-bar loop.
    // The engine re-anchors live (no-op while stopped); the store always
    // updates so the readout/playhead reflect the dragged position.
    seek(stepValue) {
      const frameStep = ((Number(stepValue) - 1) % 16 + 16) % 16;
      host.engine?.seek(frameStep);
      store.set({ step: stepValue });
    },

    // Record the live master mix (axes, atmosphere and all) and save the
    // take as WAV or MP3 when recording stops. Starting a recording also
    // starts playback if the transport is idle — there is otherwise nothing
    // to record.
    async toggleRecording() {
      await Tone.start();
      host.initialize();
      if (isRecording()) {
        const format = document.getElementById("record-format").value === "mp3" ? "mp3" : "wav";
        store.set({ recording: false });
        notify(`Rendering ${format.toUpperCase()}…`);
        try {
          const take = await stopRecording();
          if (take.channels[0].length === 0) {
            notify("Take was empty — nothing saved");
            return;
          }
          const blob = format === "mp3"
            ? encodeMp3(take.channels, take.sampleRate)
            : encodeWav(take.channels, take.sampleRate);
          const name = `${safeFileName(store.get().project.name)}-take.${format}`;
          downloadBlob(name, blob, format === "mp3" ? "audio/mpeg" : "audio/wav");
          const seconds = Math.round(take.channels[0].length / take.sampleRate);
          notify(`Recorded ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} exported as ${format.toUpperCase()}`);
          if (take.capped) notify("Recording stopped at the 5 minute cap");
        } catch (error) {
          notify(`Render failed: ${error?.message || String(error)}`);
        }
        return;
      }
      try {
        await startRecording();
      } catch (error) {
        console.error("Recording failed", error);
        notify(`Recording failed: ${error?.message || String(error)}`);
        return;
      }
      if (!store.get().playing) {
        host.engine.play();
        store.set({ playing: true });
      }
      store.set({ recording: true });
    },

    // Steer one reactive axis' target (0..1). The sequencer eases liveAxes
    // toward the store's targetAxes at each bar boundary, so moving a slider
    // here is the studio equivalent of a game's setGameAxes call.
    setAxisTarget(axis, value) {
      const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
      const targetAxes = { ...store.get().targetAxes, [axis]: clamped };
      store.set({ targetAxes });
    },

    resetProject() {
      api.stopPlayback();
      store.set({ project: hydrateProject({}), targetAxes: { intensity: 0.3, tension: 0.25, brightness: 0.7 }, selectedTrack: "melody" });
      // The engine's voice graph mirrors the old project's layers/roles;
      // rebuild so restored ids always have matching voices. Playback is
      // already stopped.
      host.rebuild();
      notify("Starter score restored");
    },
  };
  return api;
}
