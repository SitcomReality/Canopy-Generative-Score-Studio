// Coalesces store-driven view renders onto requestAnimationFrame. Slider
// drags and per-step engine publishes can fire dozens of store changes per
// second; without coalescing each one runs its subscriber fan-out inline,
// starving Tone's lookahead scheduler and audibly knocking notes out of time.
// With it, a view does at most one DOM pass per frame.
export function renderOn(store, keys, render) {
  let scheduled = false;
  store.subscribe((changed) => {
    if (!keys.some((key) => changed.includes(key))) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render(store.get());
    });
  });
}
