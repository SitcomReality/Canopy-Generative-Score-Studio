// Builds the standalone Tone.js runtime module the user drops into their web
// game. The emitted source must depend on nothing but `tone` and keep its
// public API stable: startScore, stopScore, setGameMusicState, musicEvent,
// disposeScore.
import { SCALES } from "./scales.js";

export function runtimeModule(project) {
  const config = JSON.stringify(project, null, 2);
  return `import * as Tone from "tone";

export const score = ${config};

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SCALES = ${JSON.stringify(SCALES)};
let context = "explore";
let queuedContext = null;
let victoryQueued = false;
let step = 0;
let loopId = null;
let nodes = null;

function pitchClass(key) {
  return NOTES.indexOf(({ Eb: "D#", Ab: "G#", Bb: "A#" })[key] || key);
}

function note(degree, octave = 4) {
  const scale = SCALES[score.scale];
  const wrapped = ((degree % scale.length) + scale.length) % scale.length;
  const midi = 12 * (octave + 1 + Math.floor(degree / scale.length)) + pitchClass(score.key) + scale[wrapped];
  return NOTES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

function setup() {
  const reverb = new Tone.Reverb({ decay: 5, wet: score.reverb / 100 }).toDestination();
  const melody = new Tone.PolySynth(Tone.Synth).connect(reverb);
  const chords = new Tone.PolySynth(Tone.Synth).connect(reverb);
  const bass = new Tone.MonoSynth().toDestination();
  const kick = new Tone.MembraneSynth().toDestination();
  nodes = { melody, chords, bass, kick, reverb };
  const transport = Tone.getTransport();
  transport.bpm.value = score.bpm;
  loopId = transport.scheduleRepeat((time) => {
    const boundary = step === 0 || step === 8;
    if (boundary && queuedContext) {
      context = queuedContext;
      queuedContext = null;
      transport.bpm.rampTo(score.bpm + ({ explore: 0, unease: 8, combat: 22 })[context], 0.5);
    }
    const chordDegree = score.progression[Math.floor(step / 4)];
    if (step % 4 === 0 && !score.muted.chords) {
      nodes.chords.triggerAttackRelease([chordDegree, chordDegree + 2, chordDegree + 4, chordDegree + 6].map((d) => note(d, 3)), "2n", time, 0.24);
    }
    const degree = score.melody[step];
    if (degree !== null && !score.muted.melody) nodes.melody.triggerAttackRelease(note(degree), "8n", time, 0.5);
    if (!score.muted.bass && (score.bass[step] || (context === "combat" && step % 2 === 0))) {
      nodes.bass.triggerAttackRelease(note(chordDegree, 2), "8n", time, 0.45);
    }
    if (!score.muted.percussion && (score.percussion[step] || context !== "explore")) {
      if (step % 2 === 0) nodes.kick.triggerAttackRelease(context === "combat" ? "C1" : "D1", "16n", time, context === "combat" ? 0.7 : 0.25);
    }
    if (boundary && victoryQueued) {
      [0, 2, 4, 7].forEach((d, i) => nodes.melody.triggerAttackRelease(note(d, 5), "16n", time + i * 0.09, 0.65));
      victoryQueued = false;
    }
    step = (step + 1) % 16;
  }, "8n");
}

export async function startScore() {
  await Tone.start();
  if (!nodes) setup();
  Tone.getTransport().start();
}

export function stopScore() {
  Tone.getTransport().stop();
  step = 0;
}

export function setGameMusicState({ threat = 0, inCombat = false }) {
  queuedContext = inCombat || threat > 0.7 ? "combat" : threat > 0.3 ? "unease" : "explore";
}

export function musicEvent(name) {
  if (name === "victory") victoryQueued = true;
}

export function disposeScore() {
  if (loopId !== null) Tone.getTransport().clear(loopId);
  Object.values(nodes || {}).forEach((node) => node.dispose?.());
  nodes = null;
}
`;
}
