// File download and name helpers used by every export path.
import { getTimingEngine } from "../timing/index.js";

export function downloadBlob(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  getTimingEngine().setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "canopy-score";
}
