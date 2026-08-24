// Adaptive game-state contexts. A context is now a *preset over the reactive
// axis space* (schema v4): `targets` give the axis vector the music eases
// toward when the context becomes active, so the engine derives tempo,
// density, velocity etc. from the continuous axes rather than hardcoded per-
// context rules. The game no longer forces a discrete state; it steers the
// axes and a context is just one named preset.
//
// `icon` names a lucide icon in ui/icons.js. `short`/`description` are used
// by the UI. The DEFAULT_PROJECT.contexts default derives from this list.
export const CONTEXTS = [
  {
    id: "explore",
    name: "Sunlit exploration",
    short: "Explore",
    description: "Open harmony, long tails",
    icon: "leaf",
    targets: { intensity: 0.3, tension: 0.25, brightness: 0.7 },
  },
  {
    id: "unease",
    name: "Gathering unease",
    short: "Unease",
    description: "Restless pulse, closer notes",
    icon: "zap",
    targets: { intensity: 0.55, tension: 0.5, brightness: 0.55 },
  },
  {
    id: "combat",
    name: "Open conflict",
    short: "Combat",
    description: "Driving bass and percussion",
    icon: "sword",
    targets: { intensity: 0.9, tension: 0.68, brightness: 0.35 },
  },
];
