// Coalesces store-driven view renders onto the app's single frame ticker
// (the timing engine's onFrame, fed by requestAnimationFrame). Slider drags
// and per-step engine publishes can fire dozens of store changes per second;
// without coalescing each one runs its subscriber fan-out inline, starving
// the engine's lookahead scheduler and audibly knocking notes out of time.
// With it, a view does at most one DOM pass per frame.
import { getTimingEngine } from "../timing/index.js";

export function renderOn(store, keys, render) {
  let scheduled = false;
  // One persistent frame loop per view; it renders only when a subscribed key
  // changed since the last frame.
  getTimingEngine().onFrame(() => {
    if (!scheduled) return;
    scheduled = false;
    render(store.get());
  });
  store.subscribe((changed) => {
    if (!keys.some((key) => changed.includes(key))) return;
    scheduled = true;
  });
}
