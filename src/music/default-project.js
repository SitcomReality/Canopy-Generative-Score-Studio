// The serialized project schema (version 5). Keep this shape stable: exported
// .canopy.json files and saved localStorage drafts must keep round-tripping.
// Version 2 moved per-track data into a `layers` array so layers can be added,
// removed and renamed. Version 3 added long-form fields: per-layer restWindow +
// energyRole, song-level journey + variationSeed. Version 4 adds the reactive
// dynamics contract: song-level `axes`/`contexts`/`bindings` and per-layer
// `activity`/`fills`/`automation`. Version 5 adds expressive arrangement:
// per-layer `level` (static loudness trim), song-level `sections` (verse-scale
// arrangement rotation) and `flourishes` (one-shot musical events), and drops
// runtime tempo modulation — intensity now expresses only through loudness,
// density, percussion and register. hydrateProject still accepts version 1
// flat projects and versions 2-4 (migrating them to v5 defaults).
import { SCALES } from "./scales.js";
import { INSTRUMENT_NAMES } from "./instruments.js";
import { sanitizeInstrumentConfig } from "./instrument-override.js";
import { CONTEXTS } from "./contexts.js";
import { clamp01, domainValue } from "./dynamics.js";

// Re-exported so schema consumers share the single source of truth for these
// helpers (see dev/tests/dynamics-parity.test.js).
export { clamp01, domainValue };

export const PROJECT_VERSION = 5;

// The canonical reactive axes every context target and every binding maps
// from. Each is a continuous 0..1 dimension; the game (or a context preset)
// steers these and the engine derives musical parameters from them.
export const DEFAULT_AXES = ["intensity", "tension", "brightness"];

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

// Song-level reactive space. `contexts` are named presets over `axes`
// (derived from music/contexts.js CONTEXTS); `bindings` map an axis to a
// song-level parameter. v5 removed the tempo binding — bpm is static during
// playback — so the default list is empty; custom bindings stay supported.
export const AXES = {
  intensity: { label: "Intensity" },
  tension: { label: "Tension" },
  brightness: { label: "Brightness" },
};

export const DEFAULT_CONTEXTS = CONTEXTS.map(({ id, name, targets }) => ({
  id,
  label: name,
  targets: { ...targets },
}));

export const DEFAULT_BINDINGS = [];

export const DEFAULT_LAYERS = [
  {
    id: "chords",
    name: "Canopy",
    detail: "Harmony bed",
    role: "harmony",
    color: "#9dc98d",
    muted: false,
    instrument: "Warm reed",
    instrumentConfig: null,
    density: 42,
    variation: 20,
    humanize: 10,
    restWindow: 0,
    level: 0,
    energyRole: "balanced",
    activity: null,
    fills: null,
    automation: [
      { param: "velocity", axis: "intensity", domain: [0.22, 0.3] },
      { param: "duration", axis: "intensity", domain: ["1m", "2n"] },
    ],
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
    instrumentConfig: null,
    density: 58,
    variation: 34,
    humanize: 18,
    restWindow: 0,
    level: 0,
    energyRole: "balanced",
    activity: null,
    fills: null,
    automation: [
      { param: "velocity", axis: "intensity", domain: [0.4, 0.58] },
      { param: "duration", axis: "intensity", domain: ["4n", "8n"] },
      { param: "density", axis: "tension", domain: [0.5, 0.98] },
      { param: "octave", axis: "intensity", domain: [4, 5] },
    ],
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
    instrumentConfig: null,
    density: 80,
    variation: 10,
    humanize: 8,
    restWindow: 0,
    level: 0,
    energyRole: "balanced",
    activity: null,
    fills: [
      { at: [7, 15], axis: "intensity", threshold: 0.45 },
    ],
    automation: [
      { param: "velocity", axis: "intensity", domain: [0.32, 0.56] },
      { param: "duration", axis: "intensity", domain: ["4n", "8n"] },
    ],
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
    instrumentConfig: null,
    density: 70,
    variation: 15,
    humanize: 12,
    restWindow: 0,
    level: 0,
    energyRole: "recessive",
    activity: { axis: "intensity", range: [0.35, 1] },
    fills: [
      { at: [8, 11, 14], axis: "intensity", threshold: 0.4 },
      { at: [12], axis: "intensity", threshold: 0.6 },
    ],
    automation: [
      { param: "kickProps", axis: "intensity", domain: [{ midi: "D1", vel: 0.25 }, { midi: "C1", vel: 0.68 }] },
      { param: "kick.velocity", axis: "intensity", domain: [0.25, 0.68] },
      { param: "hat.velocity", axis: "intensity", domain: [0.16, 0.32] },
      { param: "hat.variation", axis: "intensity", domain: [0.0, 0.3] },
    ],
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
  axes: AXES,
  contexts: DEFAULT_CONTEXTS,
  bindings: DEFAULT_BINDINGS,
  sections: [],
  flourishes: null,
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

// Canonical reactive axes: { id: { label } }. Whitelisted to the DEFAULT_AXES
// set so an imported score can't silently grow unknown axes.
function sanitizeAxes(value) {
  if (!value || typeof value !== "object") return { ...AXES };
  const out = {};
  for (const id of DEFAULT_AXES) {
    const raw = value[id];
    out[id] = { label: typeof raw?.label === "string" && raw.label ? raw.label : AXES[id].label };
  }
  return out;
}

// Named context presets over the axes: { id, label, targets }. Defaults to
// the DEFAULT_CONTEXTS list when missing; unknown ids are dropped.
function sanitizeContexts(value) {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_CONTEXTS.map((ctx) => ({ ...ctx, targets: { ...ctx.targets } }));
  const known = new Set(DEFAULT_CONTEXTS.map((ctx) => ctx.id));
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" && raw.id ? raw.id : null;
    if (!id || !known.has(id)) continue;
    const fallback = DEFAULT_CONTEXTS.find((ctx) => ctx.id === id);
    const targets = {};
    for (const axis of DEFAULT_AXES) {
      targets[axis] = clamp01(raw.targets?.[axis], fallback.targets[axis]);
    }
    out.push({
      id,
      label: typeof raw.label === "string" && raw.label ? raw.label : fallback.label,
      targets,
    });
  }
  return out.length > 0 ? out : DEFAULT_CONTEXTS.map((ctx) => ({ ...ctx, targets: { ...ctx.targets } }));
}

// Song-level axis->parameter maps. Only known targets are kept. The v4
// "tempo.offset" target no longer exists (bpm is static during playback in
// v5), so those bindings are dropped on migration.
function sanitizeBindings(value) {
  if (!Array.isArray(value)) return DEFAULT_BINDINGS.map((b) => ({ ...b, domain: [...b.domain] }));
  const out = [];
  for (const raw of value) {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.target !== "string" ||
      raw.target === "tempo.offset" ||
      typeof raw.axis !== "string" ||
      !Array.isArray(raw.domain) ||
      raw.domain.length < 2
    ) {
      continue;
    }
    out.push({ target: raw.target, axis: raw.axis, domain: [...raw.domain] });
  }
  return out.length > 0 ? out : [...DEFAULT_BINDINGS];
}

// v5 verses: an ordered list of { id, label, length, layers } that rotates at
// bar boundaries. `length` is the section's length in bars; `layers` maps a
// layer id to { gain: dB delta (-24..24), active: boolean }. An empty list
// means one implicit full-song section (v4 behavior).
function sanitizeSections(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const layerOverrides = {};
    if (raw.layers && typeof raw.layers === "object") {
      for (const [layerId, override] of Object.entries(raw.layers)) {
        if (!override || typeof override !== "object") continue;
        const entry = {};
        if (typeof override.gain === "number" && Number.isFinite(override.gain)) {
          entry.gain = Math.max(-24, Math.min(24, override.gain));
        }
        if (override.active !== undefined) entry.active = Boolean(override.active);
        if (Object.keys(entry).length > 0) layerOverrides[layerId] = entry;
      }
    }
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : `section-${out.length + 1}`,
      label: typeof raw.label === "string" && raw.label ? raw.label : "Verse",
      length: clampInt(raw.length, 1, 16, 4),
      layers: layerOverrides,
    });
  }
  return out.length > 0 ? out : [];
}

// v5 one-shot flourishes: optional per-song overrides of the built-in catalog
// in dynamics.js. Shape: { <name>: [{ degree, octave, at, dur, vel }] } with
// at/dur in beat units inside the bar; degrees are scale-relative so the
// harmony guard holds.
const FLOURISH_NAMES = ["victory", "defeat", "combat", "calm", "relief", "unease"];

function sanitizeFlourishes(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const name of FLOURISH_NAMES) {
    const events = value[name];
    if (!Array.isArray(events) || events.length === 0) continue;
    const clean = events
      .filter((ev) => ev && typeof ev === "object")
      .map((ev) => ({
        degree: Math.max(0, Math.min(7, Math.round(Number(ev.degree ?? 0)) || 0)),
        octave: Math.max(1, Math.min(6, Math.round(Number(ev.octave ?? 5)) || 5)),
        at: Math.max(0, Math.min(3.75, Number(ev.at) || 0)),
        dur: Math.max(0.05, Math.min(4, Number(ev.dur) || 0.25)),
        vel: Math.max(0.05, Math.min(1, Number(ev.vel ?? 0.6))),
      }))
      .filter((ev) => Number.isFinite(ev.at) && Number.isFinite(ev.dur));
    if (clean.length > 0) out[name] = clean;
  }
  return Object.keys(out).length > 0 ? out : null;
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

// A layer's automation: an array of { param, axis, domain }. The engine
// looks up per-param live values driven by a reactive axis. Kept shallow
// so the runtime can vendor the same lookup trivially.
function sanitizeAutomation(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.param === "string" &&
        typeof entry.axis === "string" &&
        Array.isArray(entry.domain) &&
        entry.domain.length >= 2,
    )
    .map((entry) => ({ param: entry.param, axis: entry.axis, domain: [...entry.domain] }));
}

// A layer's fills: { at: [steps], axis, threshold } — extra hits injected at
// those steps when the axis is high. Returns [] if anything is malformed.
const FILL_STEP = (value) => (Number.isInteger(value) && value >= 0 && value < 16 ? value : null);

function sanitizeFills(value) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const at = Array.isArray(raw.at) ? raw.at.map(FILL_STEP).filter((v) => v !== null) : [];
    if (at.length === 0 || typeof raw.axis !== "string" || typeof raw.threshold !== "number") continue;
    out.push({ at, axis: raw.axis, threshold: Math.max(0, Math.min(1, raw.threshold)) });
  }
  return out.length > 0 ? out : null;
}

// A layer's activity gate: silent outside a per-axis 0..1 range. Single-axis
// form { axis, range:[min,max] } preserved; a map of axis->range collapses to
// the tightest single range for v4.
function sanitizeActivity(value) {
  if (!value || typeof value !== "object") return null;
  const norm = (n) => clamp01(n, 0.5);
  const axis = typeof value.axis === "string" ? value.axis : null;
  const range = Array.isArray(value.range) && value.range.length === 2 ? value.range.map(norm) : null;
  if (axis && range) return { axis, range };
  // Map form: { intensity:[0.2,1], ... } — keep the tightest range across axes.
  let best = null;
  for (const r of Object.values(value)) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [lo, hi] = r.map(norm);
    if (!best || hi - lo < best.to - best.from) best = { from: lo, to: hi };
  }
  return best;
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
    instrumentConfig:
      raw?.instrumentConfig !== undefined
        ? sanitizeInstrumentConfig(raw.instrumentConfig)
        : (fallback.instrumentConfig ?? null),
    density: clampPercent(raw?.density, fallback.density),
    variation: clampPercent(raw?.variation, fallback.variation),
    humanize: clampPercent(raw?.humanize, fallback.humanize),
    restWindow: clampInt(raw?.restWindow, 0, 8, fallback.restWindow ?? 0),
    level: raw?.level !== undefined
      ? Math.max(-24, Math.min(6, Number.isFinite(Number(raw.level)) ? Number(raw.level) : 0))
      : (fallback.level ?? 0),
    energyRole: ENERGY_ROLES.includes(raw?.energyRole) ? raw.energyRole : "balanced",
    activity: raw?.activity !== undefined ? sanitizeActivity(raw.activity) : (fallback.activity ?? null),
    fills: raw?.fills !== undefined ? sanitizeFills(raw.fills) : (fallback.fills ?? null),
    automation: raw?.automation !== undefined ? sanitizeAutomation(raw.automation) : (fallback.automation ?? []),
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
    axes: sanitizeAxes(source.axes),
    contexts: sanitizeContexts(source.contexts),
    bindings: sanitizeBindings(source.bindings),
    sections: sanitizeSections(source.sections),
    flourishes: source.flourishes !== undefined ? sanitizeFlourishes(source.flourishes) : null,
    variationSeed: Math.max(0, Number.isFinite(Number(source.variationSeed)) ? Math.floor(Number(source.variationSeed)) : DEFAULT_PROJECT.variationSeed),
    layers: rawLayers
      ? rawLayers.map((layer, index) => sanitizeLayer(layer, index, usedIds))
      : layersFromV1(source),
  };
}
