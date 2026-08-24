// The serialized project schema (version 3). Keep this shape stable: exported
// .canopy.json files and saved localStorage drafts must keep round-tripping.
// Version 2 moved per-track data (notes, voice, density/variation/humanize,
// mute) into a `layers` array so layers can be added, removed and renamed.
// Version 3 added long-form fields: per-layer restWindow + energyRole, and
// song-level journey (macro energy curve) + variationSeed. hydrateProject
// still accepts version 1 flat projects and version 2 layer projects.
import { SCALES } from "./scales.js";
import { INSTRUMENT_NAMES } from "./instruments.js";

export const PROJECT_VERSION = 3;

export const EMPTY_STEPS = Array.from({ length: 16 }, () => false);

// How a layer follows the macro journey / context energy at bar boundaries:
// "forward" leans into high-energy states, "recessive" eases out of them,
// "balanced" splits the difference.
export const ENERGY_ROLES = ["balanced", "forward", "recessive"];

// Layer roles decide how the engine voices a layer and what kind of data its
// steps hold: "degrees" layers store scale degrees (null = rest), "steps"
// layers store on/off booleans.
export const LAYER_ROLES = {
  harmony: { label: "Harmony bed", kind: "steps" },
  motif: { label: "Main motif", kind: "degrees" },
  bass: { label: "Low pulse", kind: "steps" },
  percussion: { label: "Rhythm", kind: "steps" },
};

export const DEFAULT_LAYERS = [
  {
    id: "chords",
    name: "Canopy",
    detail: "Harmony bed",
    role: "harmony",
    color: "#9dc98d",
    muted: false,
    instrument: "Warm reed",
    density: 42,
    variation: 20,
    humanize: 10,
    restWindow: 0,
    energyRole: "balanced",
    steps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  },
  {
    id: "melody",
    name: "Firefly",
    detail: "Main motif",
    role: "motif",
    color: "#f1c97a",
    muted: false,
    instrument: "Glass bell",
    density: 58,
    variation: 34,
    humanize: 18,
    restWindow: 0,
    energyRole: "balanced",
    steps: [4, null, 6, 5, 4, 2, null, 1, 2, null, 4, 3, 2, 1, null, 0],
  },
  {
    id: "bass",
    name: "Root",
    detail: "Low pulse",
    role: "bass",
    color: "#d98868",
    muted: false,
    instrument: "Soft pluck",
    density: 80,
    variation: 10,
    humanize: 8,
    restWindow: 0,
    energyRole: "balanced",
    steps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  },
  {
    id: "percussion",
    name: "Footfall",
    detail: "Rhythm",
    role: "percussion",
    color: "#b8a5d7",
    muted: false,
    instrument: "Soft pluck",
    density: 70,
    variation: 15,
    humanize: 12,
    restWindow: 0,
    energyRole: "recessive",
    steps: [true, false, false, true, true, false, true, false, true, false, false, true, true, false, true, false],
  },
];

export const DEFAULT_PROJECT = {
  version: PROJECT_VERSION,
  name: "Sunlit Reaches",
  bpm: 76,
  key: "D",
  scale: "Lydian",
  progression: [0, 3, 5, 4],
  progressionName: "Open sky",
  reverb: 64,
  swing: 8,
  journey: { shape: "flat", length: 16, depth: 35 },
  variationSeed: 0,
  layers: DEFAULT_LAYERS,
};

function clampPercent(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function clampBpm(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(48, Math.min(150, Math.round(num)));
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

const JOURNEY_SHAPES = ["flat", "arc", "tide"];

function sanitizeJourney(value) {
  const raw = value && typeof value === "object" ? value : {};
  return {
    shape: JOURNEY_SHAPES.includes(raw.shape) ? raw.shape : DEFAULT_PROJECT.journey.shape,
    length: clampInt(raw.length, 4, 64, DEFAULT_PROJECT.journey.length),
    depth: clampPercent(raw.depth, DEFAULT_PROJECT.journey.depth),
  };
}

function sanitizeDegrees(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return [...value.slice(0, 16), ...Array(16).fill(null)]
    .slice(0, 16)
    .map((step) => (step === null || (Number.isInteger(step) && step >= 0 && step <= 7) ? step : null));
}

function sanitizeSteps(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return [...value.slice(0, 16), ...EMPTY_STEPS].slice(0, 16).map(Boolean);
}

function sanitizeLayer(raw, index, usedIds) {
  const fallback = DEFAULT_LAYERS[index] ?? DEFAULT_LAYERS[1];
  const role = raw && raw.role in LAYER_ROLES ? raw.role : "motif";
  const kind = LAYER_ROLES[role].kind;
  let id = typeof raw?.id === "string" && raw.id ? raw.id : `layer-${index + 1}`;
  while (usedIds.has(id)) id = `${id}-x`;
  usedIds.add(id);
  return {
    id,
    name: typeof raw?.name === "string" && raw.name ? raw.name : fallback.name,
    detail: typeof raw?.detail === "string" && raw.detail ? raw.detail : LAYER_ROLES[role].label,
    role,
    color: typeof raw?.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : fallback.color,
    muted: Boolean(raw?.muted),
    instrument: INSTRUMENT_NAMES.includes(raw?.instrument) ? raw.instrument : fallback.instrument,
    density: clampPercent(raw?.density, fallback.density),
    variation: clampPercent(raw?.variation, fallback.variation),
    humanize: clampPercent(raw?.humanize, fallback.humanize),
    restWindow: clampInt(raw?.restWindow, 0, 8, fallback.restWindow ?? 0),
    energyRole: ENERGY_ROLES.includes(raw?.energyRole) ? raw.energyRole : "balanced",
    steps: kind === "degrees" ? sanitizeDegrees(raw?.steps, fallback.steps) : sanitizeSteps(raw?.steps, fallback.steps),
  };
}

// Version 1 projects kept per-track data flat at the top level; lift it into
// the layer entries.
function layersFromV1(value) {
  const muted = value?.muted ?? {};
  const overrides = {
    chords: { muted: Boolean(muted.chords) },
    melody: {
      muted: Boolean(muted.melody),
      instrument: value.instrument,
      density: value.density,
      variation: value.variation,
      humanize: value.humanize,
      steps: value.melody,
    },
    bass: { muted: Boolean(muted.bass), steps: value.bass },
    percussion: { muted: Boolean(muted.percussion), steps: value.percussion },
  };
  return DEFAULT_LAYERS.map((layer, index) => sanitizeLayer({ ...layer, ...overrides[layer.id] }, index, new Set()));
}

// Convert a layer's steps between the two step kinds when its role changes
// (e.g. motif -> harmony): degrees collapse to on/off, hits become the tonic.
export function convertStepsForRole(steps, fromRole, toRole) {
  const fromKind = LAYER_ROLES[fromRole].kind;
  const toKind = LAYER_ROLES[toRole].kind;
  if (fromKind === toKind) return [...steps];
  if (toKind === "steps") return steps.map((step) => step !== null);
  return steps.map((step) => (step ? 0 : null));
}

// Defensive deserialization: fill any missing/malformed field from defaults,// migrate version 1 projects, and keep valid version 2 projects round-trip
// stable.
export function hydrateProject(value) {
  const source = value && typeof value === "object" ? value : {};
  const scale = typeof source.scale === "string" && source.scale in SCALES ? source.scale : null;
  const rawLayers = Array.isArray(source.layers) && source.layers.length > 0 ? source.layers : null;
  const usedIds = new Set();
  return {
    version: PROJECT_VERSION,
    name: typeof source.name === "string" && source.name ? source.name : DEFAULT_PROJECT.name,
    bpm: clampBpm(source.bpm, DEFAULT_PROJECT.bpm),
    key: typeof source.key === "string" && source.key ? source.key : DEFAULT_PROJECT.key,
    scale: scale ?? DEFAULT_PROJECT.scale,
    progression:
      Array.isArray(source.progression) &&
      source.progression.length === 4 &&
      source.progression.every((degree) => Number.isInteger(degree) && degree >= 0 && degree <= 6)
        ? [...source.progression]
        : [...DEFAULT_PROJECT.progression],
    progressionName:
      typeof source.progressionName === "string" && source.progressionName
        ? source.progressionName
        : DEFAULT_PROJECT.progressionName,
    reverb: clampPercent(source.reverb, DEFAULT_PROJECT.reverb),
    swing: clampPercent(source.swing, DEFAULT_PROJECT.swing),
    journey: sanitizeJourney(source.journey),
    variationSeed: Math.max(0, Number.isFinite(Number(source.variationSeed)) ? Math.floor(Number(source.variationSeed)) : DEFAULT_PROJECT.variationSeed),
    layers: rawLayers
      ? rawLayers.map((layer, index) => sanitizeLayer(layer, index, usedIds))
      : layersFromV1(source),
  };
}
