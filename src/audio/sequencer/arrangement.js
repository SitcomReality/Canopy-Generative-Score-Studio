// Bar-boundary arrangement: the macro journey curve, v5 section rotation,
// rest windows, and the per-layer loudness deltas they produce. Runs once per
// bar (step 0) inside the transport callback; mutates the passed state bags
// in place so the sequencer keeps a single source of truth.
import {
  activeSection,
  journeyGain,
  layerActive,
  layerLevel,
  sectionActive,
  sectionGain,
} from "../../music/dynamics.js";
import { journeyEnergy, mutateMotif } from "../../music/variation.js";

// Macro journey + arrangement energy, applied once per bar. The v5 section
// (verse) rotation adds a per-layer dB delta and can drop layers in/out for
// the length of the section. Returns the id of the now-active section.
export function applyBarStart({ score, voices, perfSteps, restCounter, resting, liveAxes, energyState }) {
  const barCount = energyState.barCount;
  const journey = score.journey ?? { shape: "flat", length: 16, depth: 0 };
  const energy = journeyEnergy(journey.shape, journey.depth, barCount, journey.length);
  const section = activeSection(score, barCount);
  for (const layer of score.layers) {
    restCounter[layer.id] = (restCounter[layer.id] ?? 0) + 1;
    const window = layer.restWindow ?? 0;
    resting[layer.id] =
      (window > 0 && restCounter[layer.id] % (window + 1) === 0) || !sectionActive(section, layer.id);
    const voice = voices[layer.id];
    if (!voice || layer.muted || resting[layer.id] || !layerActive(layer, liveAxes)) continue;
    // Total loudness bias = journey role bias + static trim + verse delta.
    const delta = journeyGain(layer, energy) + layerLevel(layer) + sectionGain(section, layer.id);
    if (voice.kind === "drums") {
      for (const node of Object.values(voice.kit ?? {})) {
        if (node?.volume && node.baseVolume !== undefined) node.volume.rampTo(node.baseVolume + delta, 0.8);
      }
    } else {
      const base = voice.kind === "chords" ? -13 : voice.kind === "melody" ? -9 : -11;
      voice.synth.volume.rampTo(Math.max(-40, Math.min(0, base + delta)), 0.8);
    }
  }
  return section?.id ?? null;
}

// Bar-boundary phrase drift for motif layers (long-form variation). A muted
// layer still drifts: it must keep consuming the shared driftRng stream so
// muting/unmuting never re-rolls other layers (gate-only, not generation).
export function applyPhraseDrift({ score, perfSteps, rng }) {
  for (const layer of score.layers) {
    if (layer.role === "motif" && layer.variation > 0) {
      perfSteps[layer.id] = mutateMotif(layer.steps, layer.variation, rng);
    }
  }
}
