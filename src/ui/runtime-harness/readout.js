// Harness live readout: log buffer plus the transport/core/axes painters fed
// by getRuntimeInfo() polling. Pure DOM painting — no module state of its own
// beyond the log's row cap.
import { AXES } from "../../music/default-project.js";

const AXIS_IDS = Object.keys(AXES);
const LOG_LIMIT = 60;

export function createLogger(logEl) {
  return (message) => {
    const row = document.createElement("p");
    row.textContent = message;
    logEl.prepend(row);
    while (logEl.children.length > LOG_LIMIT) logEl.lastChild.remove();
  };
}

export function paintTransport(els, loaded) {
  els.start.disabled = !loaded;
  els.stop.disabled = !loaded;
  els.dispose.disabled = !loaded;
}

export function paintAxes(els, liveAxes) {
  els.axes.innerHTML = AXIS_IDS.map((id) => {
    const pct = Math.round(Math.max(0, Math.min(1, liveAxes?.[id] ?? 0)) * 100);
    return `<span class="axis-meter" title="${AXES[id].label} (live)">
      <small>${AXES[id].label.slice(0, 3)}</small>
      <span class="axis-track"><i style="width:${pct}%"></i></span>
    </span>`;
  }).join("");
}

export function paintCore(els, info) {
  const playing = Boolean(info?.playing);
  els.core.className = `orbit-core state-${info?.context ?? "explore"}${playing ? " pulsing" : ""}`;
  els.core.innerHTML = `<strong>${info?.context ?? "—"}</strong><span>${playing ? "Score running" : "Score ready"}</span>`;
  els.bar.textContent = info ? String(info.bar).padStart(2, "0") : "—";
  els.verse.textContent = info?.sectionId ?? "—";
}
