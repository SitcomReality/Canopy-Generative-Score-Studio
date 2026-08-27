// Shared reactive-dynamics decision core (schema v5) — public barrel. This
// module is the single source of truth for *adaptive decisions*: turning a
// live axis vector (intensity/tension/brightness, steered by the game or a
// context preset) into musical parameters and step events. Both the studio
// preview engine (audio/audio-engine.js) and the exported .score.js runtime
// (music/runtime-module.js) use the same logic here.
//
// The implementation lives in single-purpose modules under ./dynamics/; this
// file only re-exports their public surface so every existing import path
// (`../music/dynamics.js`) stays stable.
//
// To keep the emitted .score.js dependency-free (it may only import `tone`),
// dev/scripts/vendor_dynamics.mjs concatenates these parts with module
// keywords stripped into dynamics.vendored.js, which runtime-module.js
// splices verbatim. dev/tests/dynamics-parity.test.js guards that copy.
//
// IMPORTANT: every function is PURE and Tone/DOM-free, and returns scale
// DEGREES (0..7) or null, never absolute midi. The hosts map degrees to
// pitches through their scale wrappers (scaleMidi / the vendored note()), so
// the harmony guard holds everywhere.

export {
  clamp01,
  domainValue,
  easeToward,
  bindingValue,
  ATMOSPHERE_TARGETS,
  atmosphereBindings,
} from "./dynamics/axes.js";
export { activeSection, sectionGain, sectionActive, layerLevel } from "./dynamics/sections.js";
export { layerActive, fillActive, automationLookup } from "./dynamics/gates.js";
export { humanDelay, humanVelocity } from "./dynamics/humanize.js";
export { orderEvents, computeStepFrame } from "./dynamics/step-frame.js";
export { journeyGain } from "./dynamics/arrangement.js";

export { journeyEnergy } from "./variation.js";
