// Owns the single audio-engine instance so actions never touch the engine
// variable directly. The engine is created lazily on the first user gesture
// (browser autoplay policy) and rebuilt wholesale when the synth graph must
// change — but only while the transport is stopped.
import { createAudioEngine } from "./audio-engine.js";

export function createEngineHost(store) {
  let engine = null;

  return {
    get engine() {
      return engine;
    },

    initialize() {
      if (!engine) engine = createAudioEngine(store);
      return engine;
    },

    // Adding/removing layers or changing a layer's role changes the synth
    // graph, so the engine is rebuilt instead of patched. Callers must stop
    // playback first (stopForHeavyEdit). The timing engine's dispose() is
    // idempotent and fully tears down: it stops the ticker, revokes the
    // lookahead, and clears queues/voices before releasing anything, so a
    // rebuild can never leave a stale step counter desyncing across restarts.
    rebuild() {
      if (!engine) return;
      engine.stop();
      engine.dispose();
      engine = createAudioEngine(store);
    },

    // Graph-level edits (compose, import, layer structure) stop playback
    // rather than applying live, because the rebuild they trigger cannot be
    // done glitch-free against a running transport.
    stopForHeavyEdit() {
      if (!store.get().playing) return;
      engine?.stop();
      store.set({ playing: false });
    },
  };
}
