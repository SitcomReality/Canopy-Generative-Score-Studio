// Adaptive game-state contexts. `icon` names a lucide icon in ui/icons.js;
// `tempoOffset` is added to the project BPM when the context becomes active.
export const CONTEXTS = [
  { id: "explore", name: "Sunlit exploration", short: "Explore", description: "Open harmony, long tails", icon: "leaf", tempoOffset: 0 },
  { id: "unease", name: "Gathering unease", short: "Unease", description: "Restless pulse, closer notes", icon: "zap", tempoOffset: 8 },
  { id: "combat", name: "Open conflict", short: "Combat", description: "Driving bass and percussion", icon: "sword", tempoOffset: 22 },
];
