// The exported score split into two concerns (Phase 5 clean-up):
//   * runtimeModule(project) — DATA-ONLY. Emits `export const score = {...}`
//     (schema-versioned) with no Tone import and no engine, so each .score.js
//     carries just the song data and never resurrects a second engine copy.
//   * scoreEngineSource() — the SHARED engine module (one per game). It wires
//     Tone once, embeds the pure reactive-dynamics decision core, the voice
//     builders and the transport/API loop, and exports a single factory,
//     createScoreEngine(score), a game imports once.
//
// A game's musicDirector.js imports the engine once and a small track->data
// registry, then calls createScoreEngine(score) per song.
import { DYNAMICS_SOURCE } from "../dynamics.vendored.js";
import { SCALES } from "../scales.js";
import { INSTRUMENTS } from "../instruments.js";
import { INSTRUMENT_SETTINGS_SRC } from "./parts/instrument-settings.js";
import { VOICE_BUILDERS_SRC } from "./parts/voice-builders.js";
import { JOURNEY_ENERGY_SRC } from "./parts/journey-energy.js";
import { theorySrc } from "./parts/theory.js";
import { VARIATION_SRC } from "./parts/variation.js";
import { TRANSPORT_API_SRC } from "./parts/transport-api.js";

// Data-only module: just the song, no Tone, no engine. Old .score.js files
// that embedded the engine are intentionally not regenerated this way.
export function runtimeModule(project) {
  const config = JSON.stringify(project, null, 2);
  return `// Generated score data (schema v${project.version ?? 6}). This file is
// DATA ONLY — it has no Tone import and no engine. Pair it with a single
// shared scoreEngine.js (see the game integration guide). Regenerate from the
// studio rather than hand-editing.
export const score = ${config};

export default score;
`;
}

// The shared engine module a game vendors once. Imports Tone from its own path,
// embeds the pure dynamics core, voice builders and the transport loop, and
// exposes createScoreEngine(score) — the public API lives on the returned
// runtime (startScore/stopScore/setGameAxes/getRuntimeInfo/disposeScore).
export function scoreEngineSource() {
  const dynamics = DYNAMICS_SOURCE;
  return `import * as Tone from "tone";

const INSTRUMENTS = ${JSON.stringify(INSTRUMENTS)};

${INSTRUMENT_SETTINGS_SRC}

${VOICE_BUILDERS_SRC}

// ---- reactive-dynamics core, spliced from src/music/dynamics.js ----
// __RT_DYN_BEGIN__
${dynamics}
// __RT_DYN_END__

${JOURNEY_ENERGY_SRC}

${VARIATION_SRC}

// ---- engine factory: one shared runtime per score (score is captured here) ---
export function createScoreEngine(score) {
// The harmony-guard helpers close over the score, so they must live INSIDE the
// factory (not at module scope) — scale/key come from the injected score.
${theorySrc(JSON.stringify(SCALES))}

${TRANSPORT_API_SRC}
}
`;
}
