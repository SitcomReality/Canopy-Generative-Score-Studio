// Minimal pub/sub application state. Views subscribe with a selector and are
// notified only when their selected slice actually changes, which keeps the
// per-step transport updates cheap.
import { hydrateProject, DEFAULT_PROJECT } from "../music/default-project.js";

const STORAGE_KEY = "canopy-project";

export function createAppState() {
  const state = {
    project: loadInitialProject(),
    tab: "compose",
    selectedTrack: "melody",
    playing: false,
    step: 0,
    sounding: [],
    perfSteps: {},
    liveAxes: { intensity: 0.3, tension: 0.25, brightness: 0.7 },
    bar: 0,
    currentContext: "explore",
    queuedContext: null,
    threat: 12,
    flourishQueued: null,
    sectionId: null,
    savedAt: "Local draft",
  };
  const subscribers = new Set();

  function get() {
    return state;
  }

  function set(patch) {
    const changedKeys = Object.keys(patch).filter((key) => state[key] !== patch[key]);
    if (changedKeys.length === 0) return;
    Object.assign(state, patch);
    subscribers.forEach((subscriber) => subscriber(changedKeys));
    if (changedKeys.includes("project")) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.project));
      } catch {
        // Storage may be unavailable (private mode); the session keeps working.
      }
    }
  }

  function updateProject(patch) {
    set({ project: { ...state.project, ...patch } });
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  return { get, set, updateProject, subscribe };
}

function loadInitialProject() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? hydrateProject(JSON.parse(stored)) : { ...DEFAULT_PROJECT };
  } catch {
    return { ...DEFAULT_PROJECT };
  }
}
