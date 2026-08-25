// Per-layer gates: activity windows, fill triggers, and axis automation.
import { clamp01, domainValue } from "./axes.js";

// Whether a layer's activity gate currently lets its base pattern sound.
// `live` is the axis vector; activity may be { axis, range } or { from, to }.
export function layerActive(layer, live) {
  const a = layer.activity;
  if (!a) return true;
  const v = a.axis ? clamp01(live[a.axis], 0.5) : Math.max(clamp01(live.intensity, 0), clamp01(live.tension, 0));
  if (a.range) return v >= a.range[0] && v <= a.range[1];
  return v >= a.from && v <= a.to;
}

// Whether the current step is a fill hit (extra notes injected by the layer's
// `fills` when the cited axis crosses its threshold).
export function fillActive(layer, live, step) {
  if (!layer.fills) return false;
  for (const fill of layer.fills) {
    if (!fill.at.includes(step)) continue;
    const threshold = fill.threshold ?? 0.5;
    if (clamp01(live[fill.axis], 0) >= threshold) return true;
  }
  return false;
}

// Per-layer { param: value } map derived from the layer's automation entries
// and the live axes. Params without automation resolve to undefined (callers
// fall back to the layer default or the hardcoded mid behavior).
export function automationLookup(layer, live) {
  const out = {};
  for (const entry of layer.automation ?? []) {
    out[entry.param] = domainValue(entry.domain, live[entry.axis]);
  }
  return out;
}
