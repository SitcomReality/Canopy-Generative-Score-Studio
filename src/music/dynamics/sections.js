// Verse rotation helpers (schema v5 `sections`) and static per-layer trim.

// The section active at an absolute bar count. Sections rotate in order,
// each lasting its `length` bars; a missing/empty list means one implicit
// full-song section (null here — callers treat null as "no overrides").
export function activeSection(project, bar) {
  const sections = project.sections ?? [];
  if (sections.length === 0) return null;
  const total = sections.reduce((sum, section) => sum + Math.max(1, Math.round(section.length ?? 4)), 0);
  let pos = (((bar - 1) % total) + total) % total;
  for (const section of sections) {
    const length = Math.max(1, Math.round(section.length ?? 4));
    if (pos < length) return section;
    pos -= length;
  }
  return sections[sections.length - 1];
}

// Per-layer dB delta for the active section (-24..24, default 0).
export function sectionGain(section, layerId) {
  const gain = section?.layers?.[layerId]?.gain;
  return typeof gain === "number" && Number.isFinite(gain) ? Math.max(-24, Math.min(24, gain)) : 0;
}

// Whether the active section lets the layer sound at all (`active` override).
export function sectionActive(section, layerId) {
  return section?.layers?.[layerId]?.active !== false;
}

// Static per-layer loudness trim in dB (v5 `level`, -24..6, default 0).
export function layerLevel(layer) {
  const level = Number(layer.level);
  return Number.isFinite(level) ? Math.max(-24, Math.min(6, level)) : 0;
}
