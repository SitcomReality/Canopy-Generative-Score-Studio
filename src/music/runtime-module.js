// Builds the standalone Tone.js runtime module the user drops into their web
// game. The emitted source must depend on nothing but `tone` and keep its
// public API stable: startScore, stopScore, setGameMusicState, musicEvent,
// disposeScore. It plays the version 2 layer-based project schema.
import { SCALES } from "./scales.js";
import { INSTRUMENTS } from "./instruments.js";

export function runtimeModule(project) {
  const config = JSON.stringify(project, null, 2);
  return `import * as Tone from "tone";

export const score = ${config};

const INSTRUMENTS = ${JSON.stringify(INSTRUMENTS)};

function instrumentSettings(instrument, role) {
  const preset = INSTRUMENTS[instrument] || INSTRUMENTS["Glass bell"];
  return preset[role];
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = ${JSON.stringify(SCALES)};
let context = "explore";
let queuedContext = null;
let victoryQueued = false;
let step = 0;
let loopId = null;
let nodes = null;
let voices = {};
let perfSteps = {};
let barCount = 0;
const restCounter = {};
const resting = {};

function pitchClass(key) {
  return NOTES.indexOf(({ Eb: "D#", Ab: "G#", Bb: "A#" })[key] || key);
}

function note(degree, octave = 4) {
  const scale = SCALES[score.scale];
  const wrapped = ((degree % scale.length) + scale.length) % scale.length;
  const midi = 12 * (octave + 1 + Math.floor(degree / scale.length)) + pitchClass(score.key) + scale[wrapped];
  return NOTES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function chord(degree) {
  return [degree, degree + 2, degree + 4, degree + 6].map((d) => note(d, 3));
}

// Anchored phrase mutation + macro journey curve (long-form variation):
// steps 0 and 15 never change; shifts move at most one scale degree; rests
// spawn near neighbours. The journey returns energy 0..1 per bar.
const clampDegree = (d) => Math.max(0, Math.min(7, d));

function journeyEnergy(shape, depth, bar, length) {  const span = Math.max(4, Math.round(length));
  const phase = (((bar % span) + span) % span) / span;
  let raw;
  if (shape === "arc") {
    raw = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  } else if (shape === "tide") {
    raw = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  } else {
    return 0.5;
  }
  const amount = Math.max(0, Math.min(100, depth)) / 100;
  return 0.5 + (raw - 0.5) * amount;
}

// Deterministic PRNG (mulberry32); seed 0 means fully random.
function makeRng(seed) {
  const s = Math.floor(Number(seed));
  if (!Number.isFinite(s) || s <= 0) return Math.random;
  let a = s >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let driftRng = Math.random;

function mutateMotif(steps, rate, rng = Math.random) {
  const out = [...steps];
  const chance = (Math.max(0, Math.min(100, rate)) / 100) * 0.35;
  const mutableIndexes = [];
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] !== null) mutableIndexes.push(i);
    if (rng() >= chance * (out[i] === null ? 0.5 : 1)) continue;
    if (out[i] === null) {
      let before = null;
      for (let j = i - 1; j >= 0; j--) if (out[j] !== null) { before = out[j]; break; }
      let after = null;
      for (let j = i + 1; j < out.length; j++) if (out[j] !== null) { after = out[j]; break; }
      const base = before ?? after ?? 0;
      out[i] = clampDegree(base + (rng() > 0.5 ? 1 : -1));
      continue;
    }
    const roll = rng();
    if (roll < 0.4) {
      out[i] = clampDegree(out[i] + (rng() > 0.5 ? 1 : -1));
    } else if (roll < 0.7) {
      out[i] = null;
    } else {
      const others = mutableIndexes.filter((index) => index !== i);
      if (others.length > 0) {
        const swapWith = others[Math.floor(rng() * others.length)];
        out[i] = out[swapWith];
        out[swapWith] = steps[i];
      }
    }
  }
  return out;
}

function setup() {
  const reverb = new Tone.Reverb({ decay: 5, wet: score.reverb / 100 }).toDestination();
  nodes = { reverb, layers: {} };
  voices = {};
  perfSteps = {};
  barCount = 0;
  for (const k of Object.keys(restCounter)) delete restCounter[k];
  for (const k of Object.keys(resting)) delete resting[k];
  for (const layer of score.layers) {
    if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
    if (layer.role === "harmony") {
      const synth = new Tone.PolySynth(Tone.Synth).set({ ...instrumentSettings(layer.instrument, "harmony"), volume: -16 }).connect(reverb);
      voices[layer.id] = { kind: "chords", synth };
      nodes.layers[layer.id] = synth;
    } else if (layer.role === "motif") {
      const synth = new Tone.PolySynth(Tone.Synth).set({ ...instrumentSettings(layer.instrument, "motif"), volume: -9 }).connect(reverb);
      voices[layer.id] = { kind: "melody", synth };
      nodes.layers[layer.id] = synth;
    } else if (layer.role === "bass") {
      const synth = new Tone.MonoSynth({ ...instrumentSettings(layer.instrument, "bass"), volume: -11 }).toDestination();
      voices[layer.id] = { kind: "bass", synth };
      nodes.layers[layer.id] = synth;
    } else if (layer.role === "percussion") {
      const drums = instrumentSettings(layer.instrument, "percussion");
      const kick = new Tone.MembraneSynth({ ...drums.kick, volume: -10 }).toDestination();
      const hat = new Tone.NoiseSynth({ ...drums.hat, volume: -24 }).connect(reverb);
      voices[layer.id] = { kind: "drums", kick, hat };
      nodes.layers[layer.id] = { kick, hat };
    }
  }
  const transport = Tone.getTransport();
  transport.bpm.value = score.bpm;
  transport.swing = score.swing / 100;
  transport.swingSubdivision = "8n";
  loopId = transport.scheduleRepeat((time) => {
    const boundary = step === 0 || step === 8;
    if (boundary && queuedContext) {
      context = queuedContext;
      queuedContext = null;
      transport.bpm.rampTo(score.bpm + ({ explore: 0, unease: 8, combat: 22 })[context], 0.5);
    }
    const chordDegree = score.progression[Math.floor(step / 4)];
    if (step === 0) {
      barCount += 1;
      const journey = score.journey || { shape: "flat", length: 16, depth: 0 };
      const energy = journeyEnergy(journey.shape, journey.depth, barCount, journey.length);
      for (const layer of score.layers) {
        restCounter[layer.id] = (restCounter[layer.id] || 0) + 1;
        const window = layer.restWindow || 0;
        resting[layer.id] = window > 0 && restCounter[layer.id] % (window + 1) === 0;
        const voice = voices[layer.id];
        if (!voice) continue;
        const bias = layer.energyRole === "forward" ? 3 : layer.energyRole === "recessive" ? -3 : 1.5;
        const delta = ((energy - 0.5) * 2) * bias;
        if (voice.kind === "drums") {
          voice.kick.volume.rampTo(-10 + delta, 0.8);
          voice.hat.volume.rampTo(-24 + delta, 0.8);
        } else if (voice.synth.volume) {
          const base = voice.kind === "chords" ? -16 : voice.kind === "melody" ? -9 : -11;
          voice.synth.volume.rampTo(Math.max(-40, Math.min(0, base + delta)), 0.8);
        }
      }
    }
    if (boundary) {
      for (const layer of score.layers) {
        if (layer.role === "motif" && !layer.muted && layer.variation > 0) {
          perfSteps[layer.id] = mutateMotif(layer.steps, layer.variation, driftRng);
        }
      }
    }
    for (const layer of score.layers) {
      const voice = voices[layer.id];
      if (!voice || layer.muted || resting[layer.id]) continue;
      if (voice.kind === "chords" && layer.steps[step]) {
        voice.synth.triggerAttackRelease(chord(chordDegree), "2n", time, 0.24);
      } else if (voice.kind === "melody") {
        const phrase = perfSteps[layer.id] ?? layer.steps;
        if (phrase[step] !== null) {
          voice.synth.triggerAttackRelease(note(phrase[step]), "8n", time, 0.5);
        }
      } else if (voice.kind === "bass" && (layer.steps[step] || (context === "combat" && step % 2 === 0))) {
        voice.synth.triggerAttackRelease(note(chordDegree, 2), "8n", time, 0.45);
      } else if (voice.kind === "drums" && (layer.steps[step] || context !== "explore")) {
        if (step % 2 === 0) voice.kick.triggerAttackRelease(context === "combat" ? "C1" : "D1", "16n", time, context === "combat" ? 0.7 : 0.25);
      }
    }
    if (boundary && victoryQueued) {
      const lead = score.layers.find((layer) => layer.role === "motif" && !layer.muted);
      const synth = lead && voices[lead.id] ? voices[lead.id].synth : null;
      if (synth) [0, 2, 4, 7].forEach((d, i) => synth.triggerAttackRelease(note(d, 5), "16n", time + i * 0.09, 0.65));
      // Triumph resolves back to unthreatened exploration.
      victoryQueued = false;
      context = "explore";
      queuedContext = null;
      transport.bpm.rampTo(score.bpm, 0.5);
    }
    step = (step + 1) % 16;
  }, "8n");
}

export async function startScore() {
  await Tone.start();
  if (!nodes) setup();
  driftRng = makeRng(score.variationSeed || 0);
  Tone.getTransport().start();
}

export function stopScore() {
  Tone.getTransport().stop();
  step = 0;
  driftRng = Math.random;
  // Discard drifted phrases so the next playback starts from the score
  // as written.
  barCount = 0;
  for (const k of Object.keys(restCounter)) delete restCounter[k];
  for (const k of Object.keys(resting)) delete resting[k];
  for (const layer of score.layers) {
    if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
  }
}
export function setGameMusicState({ threat = 0, inCombat = false }) {
  queuedContext = inCombat || threat > 0.7 ? "combat" : threat > 0.3 ? "unease" : "explore";
}

// After a one-shot event such as "victory" the music resolves back to
// exploration at the next bar boundary.
export function musicEvent(name) {
  if (name === "victory") victoryQueued = true;
}

export function disposeScore() {
  if (loopId !== null) Tone.getTransport().clear(loopId);
  Object.values(nodes || {}).forEach((node) => node.dispose?.());
  Object.values(nodes?.layers || {}).forEach((node) => {
    if (Array.isArray(node)) node.forEach((child) => child.dispose());
    else node.dispose?.();
  });
  nodes = null;
  voices = {};
}
`;
}
