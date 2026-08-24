import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Midi } from "@tonejs/midi";
import * as Tone from "tone";
import {
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Code2,
  Copy,
  Download,
  FileJson,
  Flag,
  FolderOpen,
  Leaf,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Square,
  Sword,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { cn } from "./utils/cn";

type AppTab = "compose" | "runtime" | "guide";
type MusicContext = "explore" | "unease" | "combat";
type TrackId = "chords" | "melody" | "bass" | "percussion";

type Project = {
  version: 1;
  name: string;
  bpm: number;
  key: string;
  scale: keyof typeof SCALES;
  progression: number[];
  progressionName: string;
  melody: Array<number | null>;
  bass: boolean[];
  percussion: boolean[];
  density: number;
  variation: number;
  humanize: number;
  reverb: number;
  swing: number;
  instrument: "Glass bell" | "Warm reed" | "Soft pluck";
  muted: Record<TrackId, boolean>;
};

type AudioEngine = {
  melody: Tone.PolySynth;
  chords: Tone.PolySynth;
  bass: Tone.MonoSynth;
  kick: Tone.MembraneSynth;
  hat: Tone.NoiseSynth;
  reverb: Tone.Reverb;
  delay: Tone.FeedbackDelay;
  limiter: Tone.Limiter;
  master: Tone.Gain;
  loopId: number;
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Pentatonic: [0, 2, 4, 7, 9],
} as const;

const PROGRESSIONS = [
  { name: "Open sky", degrees: [0, 3, 5, 4] },
  { name: "Homeward", degrees: [0, 4, 5, 3] },
  { name: "Moonlit", degrees: [5, 3, 0, 4] },
  { name: "Uncertain path", degrees: [0, 2, 5, 4] },
];

const CONTEXTS: Array<{
  id: MusicContext;
  name: string;
  short: string;
  description: string;
  icon: typeof Leaf;
}> = [
  { id: "explore", name: "Sunlit exploration", short: "Explore", description: "Open harmony, long tails", icon: Leaf },
  { id: "unease", name: "Gathering unease", short: "Unease", description: "Restless pulse, closer notes", icon: Zap },
  { id: "combat", name: "Open conflict", short: "Combat", description: "Driving bass and percussion", icon: Sword },
];

const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii"];
const EMPTY_STEPS = Array.from({ length: 16 }, () => false);

const DEFAULT_PROJECT: Project = {
  version: 1,
  name: "Sunlit Reaches",
  bpm: 76,
  key: "D",
  scale: "Lydian",
  progression: [0, 3, 5, 4],
  progressionName: "Open sky",
  melody: [4, null, 6, 5, 4, 2, null, 1, 2, null, 4, 3, 2, 1, null, 0],
  bass: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  percussion: [true, false, false, true, true, false, true, false, true, false, false, true, true, false, true, false],
  density: 58,
  variation: 34,
  humanize: 18,
  reverb: 64,
  swing: 8,
  instrument: "Glass bell",
  muted: { chords: false, melody: false, bass: false, percussion: false },
};

const TRACKS: Array<{ id: TrackId; name: string; detail: string; color: string }> = [
  { id: "chords", name: "Canopy", detail: "Harmony bed", color: "#9dc98d" },
  { id: "melody", name: "Firefly", detail: "Main motif", color: "#f1c97a" },
  { id: "bass", name: "Root", detail: "Low pulse", color: "#d98868" },
  { id: "percussion", name: "Footfall", detail: "Rhythm", color: "#b8a5d7" },
];

function keyToPitchClass(key: string) {
  const flats: Record<string, string> = { Eb: "D#", Ab: "G#", Bb: "A#" };
  return NOTE_NAMES.indexOf(flats[key] ?? key);
}

function midiToNote(midi: number) {
  const rounded = Math.round(midi);
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

function scaleMidi(project: Project, degree: number, octave = 4) {
  const scale = SCALES[project.scale];
  const wrapped = ((degree % scale.length) + scale.length) % scale.length;
  const octaveLift = Math.floor(degree / scale.length);
  return 12 * (octave + 1 + octaveLift) + keyToPitchClass(project.key) + scale[wrapped];
}

function chordNotes(project: Project, degree: number, octave = 3) {
  return [degree, degree + 2, degree + 4, degree + 6].map((item) => midiToNote(scaleMidi(project, item, octave)));
}

function chordLabel(project: Project, degree: number) {
  const root = midiToNote(scaleMidi(project, degree, 3)).replace(/[0-9]/g, "");
  const quality = project.scale === "Minor" || project.scale === "Dorian" ? (degree === 0 ? "m7" : "add9") : "maj7";
  return `${root}${quality}`;
}

function hydrateProject(value: Partial<Project>): Project {
  return {
    ...DEFAULT_PROJECT,
    ...value,
    melody: Array.isArray(value.melody) ? [...value.melody.slice(0, 16), ...Array(16).fill(null)].slice(0, 16) : DEFAULT_PROJECT.melody,
    bass: Array.isArray(value.bass) ? [...value.bass.slice(0, 16), ...EMPTY_STEPS].slice(0, 16) : DEFAULT_PROJECT.bass,
    percussion: Array.isArray(value.percussion)
      ? [...value.percussion.slice(0, 16), ...EMPTY_STEPS].slice(0, 16)
      : DEFAULT_PROJECT.percussion,
    muted: { ...DEFAULT_PROJECT.muted, ...(value.muted ?? {}) },
  };
}

function loadInitialProject() {
  try {
    const stored = localStorage.getItem("canopy-project");
    return stored ? hydrateProject(JSON.parse(stored)) : DEFAULT_PROJECT;
  } catch {
    return DEFAULT_PROJECT;
  }
}

function downloadBlob(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "canopy-score";
}

function runtimeModule(project: Project) {
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

function App() {
  const [tab, setTab] = useState<AppTab>("compose");
  const [project, setProject] = useState<Project>(loadInitialProject);
  const [selectedTrack, setSelectedTrack] = useState<TrackId>("melody");
  const [playing, setPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [currentContext, setCurrentContext] = useState<MusicContext>("explore");
  const [queuedContext, setQueuedContext] = useState<MusicContext | null>(null);
  const [threat, setThreat] = useState(12);
  const [victoryQueued, setVictoryQueued] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedAt, setSavedAt] = useState("Local draft");

  const fileRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const projectRef = useRef(project);
  const contextRef = useRef(currentContext);
  const queuedContextRef = useRef(queuedContext);
  const victoryRef = useRef(victoryQueued);
  const stepRef = useRef(0);

  const scaleLanes = useMemo(() => {
    const count = SCALES[project.scale].length;
    return Array.from({ length: Math.min(8, count + 1) }, (_, index) => count - index).map((degree) => ({
      degree,
      note: midiToNote(scaleMidi(project, degree, 4)),
    }));
  }, [project.key, project.scale]);

  const activeContext = CONTEXTS.find((item) => item.id === currentContext)!;
  const selectedTrackInfo = TRACKS.find((track) => track.id === selectedTrack)!;

  useEffect(() => {
    projectRef.current = project;
    localStorage.setItem("canopy-project", JSON.stringify(project));
  }, [project]);

  useEffect(() => {
    contextRef.current = currentContext;
    const transport = Tone.getTransport();
    if (engineRef.current) {
      const offset = currentContext === "combat" ? 22 : currentContext === "unease" ? 8 : 0;
      transport.bpm.rampTo(project.bpm + offset, 0.6);
    }
  }, [currentContext, project.bpm]);

  useEffect(() => {
    queuedContextRef.current = queuedContext;
  }, [queuedContext]);

  useEffect(() => {
    victoryRef.current = victoryQueued;
  }, [victoryQueued]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.reverb.wet.rampTo(project.reverb / 100, 0.2);
      Tone.getTransport().swing = project.swing / 100;
    }
  }, [project.reverb, project.swing]);

  useEffect(() => {
    const melody = engineRef.current?.melody;
    if (!melody) return;
    if (project.instrument === "Warm reed") {
      melody.set({ oscillator: { type: "square8" }, envelope: { attack: 0.12, decay: 0.22, sustain: 0.3, release: 1.8 } });
    } else if (project.instrument === "Soft pluck") {
      melody.set({ oscillator: { type: "triangle" }, envelope: { attack: 0.008, decay: 0.45, sustain: 0.08, release: 1.4 } });
    } else {
      melody.set({ oscillator: { type: "sine" }, envelope: { attack: 0.04, decay: 0.3, sustain: 0.22, release: 2.8 } });
    }
  }, [project.instrument]);

  useEffect(() => {
    return () => {
      const engine = engineRef.current;
      if (!engine) return;
      Tone.getTransport().clear(engine.loopId);
      engine.melody.dispose();
      engine.chords.dispose();
      engine.bass.dispose();
      engine.kick.dispose();
      engine.hat.dispose();
      engine.delay.dispose();
      engine.reverb.dispose();
      engine.limiter.dispose();
      engine.master.dispose();
      engineRef.current = null;
    };
  }, []);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  function updateProject(patch: Partial<Project>) {
    setProject((current) => ({ ...current, ...patch }));
  }

  function initializeAudio() {
    if (engineRef.current) return engineRef.current;

    const master = new Tone.Gain(0.74).toDestination();
    const limiter = new Tone.Limiter(-1).connect(master);
    const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: projectRef.current.reverb / 100 }).connect(limiter);
    const delay = new Tone.FeedbackDelay("8n.", 0.22).connect(reverb);
    delay.wet.value = 0.26;

    const voice = projectRef.current.instrument;
    const melody = new Tone.PolySynth(Tone.Synth).set({
      oscillator: { type: voice === "Warm reed" ? "square8" : voice === "Soft pluck" ? "triangle" : "sine" },
      envelope: voice === "Warm reed"
        ? { attack: 0.12, decay: 0.22, sustain: 0.3, release: 1.8 }
        : voice === "Soft pluck"
          ? { attack: 0.008, decay: 0.45, sustain: 0.08, release: 1.4 }
          : { attack: 0.04, decay: 0.3, sustain: 0.22, release: 2.8 },
      volume: -9,
    }).connect(delay);
    const chords = new Tone.PolySynth(Tone.Synth).set({
      oscillator: { type: "triangle8" },
      envelope: { attack: 1.3, decay: 1.5, sustain: 0.5, release: 4.5 },
      volume: -16,
    }).connect(reverb);
    const bass = new Tone.MonoSynth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.03, decay: 0.25, sustain: 0.28, release: 0.7 },
      filterEnvelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.4, baseFrequency: 80, octaves: 2.8 },
      volume: -11,
    }).connect(limiter);
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.2 },
      volume: -10,
    }).connect(limiter);
    const hat = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
      volume: -24,
    }).connect(reverb);

    const transport = Tone.getTransport();
    transport.bpm.value = projectRef.current.bpm;
    transport.swing = projectRef.current.swing / 100;
    transport.swingSubdivision = "8n";

    const loopId = transport.scheduleRepeat((time) => {
      const score = projectRef.current;
      let context = contextRef.current;
      const step = stepRef.current;
      const isBar = step === 0 || step === 8;

      if (isBar && queuedContextRef.current) {
        context = queuedContextRef.current;
        contextRef.current = context;
        queuedContextRef.current = null;
        window.requestAnimationFrame(() => {
          setCurrentContext(context);
          setQueuedContext(null);
        });
      }

      const contextDensity = context === "combat" ? 0.98 : context === "unease" ? 0.76 : 0.5;
      const variationChance = score.variation / 100;
      const chordDegree = score.progression[Math.floor(step / 4) % score.progression.length];
      const humanDelay = Math.random() * (score.humanize / 100) * 0.035;

      if (step % 4 === 0 && !score.muted.chords) {
        chords.triggerAttackRelease(chordNotes(score, chordDegree), context === "combat" ? "2n" : "1m", time, context === "combat" ? 0.3 : 0.22);
      }

      let melodyDegree = score.melody[step];
      if (melodyDegree !== null && Math.random() < 0.12 * variationChance) {
        melodyDegree = Math.max(0, Math.min(7, melodyDegree + (Math.random() > 0.5 ? 1 : -1)));
      }
      if (melodyDegree === null && Math.random() < 0.08 * variationChance * contextDensity) {
        melodyDegree = Math.max(0, Math.min(7, chordDegree + (Math.random() > 0.5 ? 2 : 4)));
      }
      if (melodyDegree !== null && !score.muted.melody && Math.random() < score.density / 100 + 0.24) {
        const octave = context === "combat" && step % 4 === 3 ? 5 : 4;
        const velocity = context === "combat" ? 0.58 : context === "unease" ? 0.48 : 0.4;
        melody.triggerAttackRelease(midiToNote(scaleMidi(score, melodyDegree, octave)), context === "explore" ? "4n" : "8n", time + humanDelay, velocity);
      }

      const bassActive = score.bass[step] || (context === "unease" && step % 4 === 2) || (context === "combat" && step % 2 === 0);
      if (bassActive && !score.muted.bass) {
        bass.triggerAttackRelease(midiToNote(scaleMidi(score, chordDegree, 2)), context === "combat" ? "8n" : "4n", time + humanDelay * 0.45, context === "combat" ? 0.56 : 0.32);
      }

      const rhythmActive = score.percussion[step] || (context === "combat" && step % 2 === 0);
      if (rhythmActive && !score.muted.percussion) {
        if (step % 4 === 0 || context === "combat") {
          kick.triggerAttackRelease(context === "combat" ? "C1" : "D1", "16n", time, context === "combat" ? 0.68 : 0.25);
        }
        if (context !== "explore" || Math.random() < variationChance * 0.3) {
          hat.triggerAttackRelease("32n", time + humanDelay * 0.7, context === "combat" ? 0.32 : 0.16);
        }
      }

      if (isBar && victoryRef.current) {
        [0, 2, 4, 7].forEach((degree, index) => {
          melody.triggerAttackRelease(midiToNote(scaleMidi(score, degree, 5)), "16n", time + index * 0.09, 0.68);
        });
        victoryRef.current = false;
        window.requestAnimationFrame(() => setVictoryQueued(false));
      }

      window.setTimeout(() => setCurrentStep(step), 0);
      stepRef.current = (step + 1) % 16;
    }, "8n");

    engineRef.current = { melody, chords, bass, kick, hat, reverb, delay, limiter, master, loopId };
    return engineRef.current;
  }

  async function togglePlayback() {
    await Tone.start();
    initializeAudio();
    const transport = Tone.getTransport();
    if (playing) {
      transport.pause();
      setPlaying(false);
    } else {
      transport.start("+0.05");
      setPlaying(true);
    }
  }

  function stopPlayback() {
    const transport = Tone.getTransport();
    transport.stop();
    transport.position = 0;
    stepRef.current = 0;
    setCurrentStep(0);
    setPlaying(false);
  }

  function requestContext(next: MusicContext) {
    if (playing) {
      setQueuedContext(next);
      queuedContextRef.current = next;
    } else {
      setCurrentContext(next);
      contextRef.current = next;
      setQueuedContext(null);
      queuedContextRef.current = null;
    }
  }

  function handleThreat(value: number) {
    setThreat(value);
    const next: MusicContext = value > 68 ? "combat" : value > 30 ? "unease" : "explore";
    if (next !== currentContext && next !== queuedContextRef.current) requestContext(next);
  }

  function queueVictory() {
    setVictoryQueued(true);
    victoryRef.current = true;
    notify(playing ? "Victory flourish queued for the next bar" : "Victory flourish will play after playback starts");
  }

  function toggleMute(track: TrackId) {
    updateProject({ muted: { ...project.muted, [track]: !project.muted[track] } });
  }

  function setMelodyStep(step: number, degree: number) {
    const melody = [...project.melody];
    melody[step] = melody[step] === degree ? null : degree;
    updateProject({ melody });
  }

  function toggleBooleanStep(track: "bass" | "percussion", step: number) {
    const values = [...project[track]];
    values[step] = !values[step];
    updateProject({ [track]: values });
  }

  function composeMelody() {
    const scaleLength = SCALES[project.scale].length;
    let cursor = Math.min(4, scaleLength - 1);
    const melody = Array.from({ length: 16 }, (_, index) => {
      const chord = project.progression[Math.floor(index / 4)];
      if (index % 4 === 0) {
        cursor = Math.min(7, chord + (Math.random() > 0.55 ? 2 : 4));
        return cursor;
      }
      if (Math.random() > project.density / 100) return null;
      const movement = Math.random() < 0.7 ? (Math.random() > 0.5 ? 1 : -1) : Math.random() > 0.5 ? 2 : -2;
      cursor = Math.max(0, Math.min(7, cursor + movement));
      return cursor;
    });
    melody[15] = 0;
    updateProject({ melody });
    notify("New in-key motif composed");
  }

  function makeSparser() {
    const melody = project.melody.map((note, index) => (index % 4 !== 0 && Math.random() < 0.38 ? null : note));
    updateProject({ melody, density: Math.max(20, project.density - 12) });
    notify("Motif simplified without changing its harmony");
  }

  function resetProject() {
    setProject(DEFAULT_PROJECT);
    stopPlayback();
    setCurrentContext("explore");
    setThreat(12);
    notify("Starter score restored");
  }

  function saveProject() {
    localStorage.setItem("canopy-project", JSON.stringify(project));
    setSavedAt(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    notify("Project saved in this browser");
  }

  function exportProject() {
    downloadBlob(`${safeFileName(project.name)}.canopy.json`, JSON.stringify(project, null, 2), "application/json");
    setExportOpen(false);
    notify("Editable project exported");
  }

  function exportRuntime() {
    downloadBlob(`${safeFileName(project.name)}.score.js`, runtimeModule(project), "text/javascript");
    setExportOpen(false);
    notify("Standalone Tone.js score module exported");
  }

  function exportMidi() {
    const midi = new Midi();
    midi.header.name = project.name;
    midi.header.setTempo(project.bpm);
    const melodyTrack = midi.addTrack();
    melodyTrack.name = "Canopy Melody";
    const chordTrack = midi.addTrack();
    chordTrack.name = "Canopy Chords";
    const eighth = 60 / project.bpm / 2;
    project.melody.forEach((degree, step) => {
      if (degree !== null) melodyTrack.addNote({ name: midiToNote(scaleMidi(project, degree, 4)), time: step * eighth, duration: eighth * 0.82, velocity: 0.7 });
    });
    project.progression.forEach((degree, index) => {
      chordNotes(project, degree).forEach((name) => chordTrack.addNote({ name, time: index * eighth * 4, duration: eighth * 3.8, velocity: 0.45 }));
    });
    downloadBlob(`${safeFileName(project.name)}.mid`, new Uint8Array(midi.toArray()), "audio/midi");
    setExportOpen(false);
    notify("Two-bar MIDI sketch exported");
  }

  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (/\.midi?$/i.test(file.name)) {
        const midi = new Midi(await file.arrayBuffer());
        const source = [...midi.tracks].sort((a, b) => b.notes.length - a.notes.length)[0];
        if (!source || source.notes.length === 0) throw new Error("No MIDI notes found");
        const bpm = Math.round(midi.header.tempos[0]?.bpm ?? project.bpm);
        const eighth = 60 / bpm / 2;
        const melody: Array<number | null> = Array(16).fill(null);
        const scale = SCALES[project.scale];
        const root = keyToPitchClass(project.key);
        source.notes.forEach((note) => {
          const step = Math.round(note.time / eighth) % 16;
          const relative = ((note.midi - root) % 12 + 12) % 12;
          let degree = 0;
          let closest = 99;
          scale.forEach((interval, index) => {
            const distance = Math.abs(interval - relative);
            if (distance < closest) {
              degree = index + (note.octave > 4 ? scale.length : 0);
              closest = distance;
            }
          });
          melody[step] = Math.min(7, degree);
        });
        updateProject({ name: midi.name || file.name.replace(/\.midi?$/i, ""), bpm, melody });
        notify("MIDI imported and fitted to the current scale");
      } else {
        const next = hydrateProject(JSON.parse(await file.text()));
        setProject(next);
        stopPlayback();
        notify("Canopy project loaded");
      }
    } catch (error) {
      notify(error instanceof Error ? `Import failed: ${error.message}` : "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const integrationSnippet = `import {
  startScore,
  setGameMusicState,
  musicEvent
} from "./${safeFileName(project.name)}.score.js";

// Call once from a player gesture.
await startScore();

// Update when your game state changes.
setGameMusicState({ threat: 0.82, inCombat: true });

// One-shot musical punctuation.
musicEvent("victory");`;

  async function copySnippet() {
    await navigator.clipboard.writeText(integrationSnippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup" onClick={() => setTab("compose")} role="button" tabIndex={0}>
          <div className="brand-mark"><AudioLines size={19} strokeWidth={1.8} /></div>
          <div>
            <div className="brand-name">CANOPY</div>
            <div className="brand-caption">Generative score studio</div>
          </div>
        </div>

        <nav className="main-tabs" aria-label="Main sections">
          {([
            ["compose", "Compose", AudioLines],
            ["runtime", "Runtime", Code2],
            ["guide", "Field guide", BookOpen],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} className={cn("main-tab", tab === id && "active")} onClick={() => setTab(id)}>
              <Icon size={15} />
              <span>{label}</span>
              {tab === id && <motion.span layoutId="tab-underline" className="tab-underline" />}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <span className="save-state"><Check size={12} /> {savedAt}</span>
          <button className="icon-action labeled" onClick={() => fileRef.current?.click()} title="Import project or MIDI">
            <FolderOpen size={16} /> <span>Import</span>
          </button>
          <button className="icon-action" onClick={saveProject} title="Save in this browser"><Save size={16} /></button>
          <div className="export-wrap">
            <button className="export-button" onClick={() => setExportOpen((open) => !open)}>
              Export <ChevronDown size={14} />
            </button>
            <AnimatePresence>
              {exportOpen && (
                <motion.div className="export-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                  <button onClick={exportProject}><FileJson size={16} /><span><strong>Editable project</strong><small>Open again in Canopy</small></span></button>
                  <button onClick={exportRuntime}><Code2 size={16} /><span><strong>Tone.js runtime</strong><small>Drop into a web game</small></span></button>
                  <button onClick={exportMidi}><Download size={16} /><span><strong>MIDI sketch</strong><small>Open in any DAW</small></span></button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <input ref={fileRef} type="file" hidden accept=".json,.canopy,.mid,.midi,application/json,audio/midi" onChange={(event) => importFile(event.target.files?.[0])} />
        </div>
      </header>

      <AnimatePresence mode="wait">
        {tab === "compose" && (
          <motion.main key="compose" className="compose-view" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <section className="transport-bar" aria-label="Playback controls">
              <div className="project-identity">
                <input value={project.name} onChange={(event) => updateProject({ name: event.target.value })} aria-label="Project name" />
                <span>2 bars / adaptive loop</span>
              </div>
              <div className="transport-controls">
                <button className="play-button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                </button>
                <button className="stop-button" onClick={stopPlayback} aria-label="Stop"><Square size={14} fill="currentColor" /></button>
                <div className={cn("transport-readout", playing && "running")}>
                  <span>{String(Math.floor(currentStep / 8) + 1).padStart(2, "0")}</span>
                  <i />
                  <span>{String(Math.floor((currentStep % 8) / 2) + 1).padStart(2, "0")}</span>
                  <small>BAR&nbsp;&nbsp;&nbsp;BEAT</small>
                </div>
              </div>
              <div className="tempo-controls">
                <label>
                  <span>Tempo</span>
                  <div><input type="number" min="48" max="150" value={project.bpm} onChange={(event) => updateProject({ bpm: Number(event.target.value) })} /><small>BPM</small></div>
                </label>
                <label>
                  <span>Key</span>
                  <select value={project.key} onChange={(event) => updateProject({ key: event.target.value })}>{KEYS.map((key) => <option key={key}>{key}</option>)}</select>
                </label>
                <label>
                  <span>Scale</span>
                  <select value={project.scale} onChange={(event) => updateProject({ scale: event.target.value as Project["scale"] })}>{Object.keys(SCALES).map((scale) => <option key={scale}>{scale}</option>)}</select>
                </label>
              </div>
              <div className="transport-wave" aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => <i key={index} style={{ "--bar": `${18 + ((index * 17) % 34)}px`, "--delay": `${index * -0.07}s` } as React.CSSProperties} />)}
              </div>
            </section>

            <section className="context-ribbon">
              <div className="context-label">
                <span>Live game state</span>
                <strong>{queuedContext ? `Transitioning to ${CONTEXTS.find((item) => item.id === queuedContext)?.short.toLowerCase()} on next bar` : activeContext.description}</strong>
              </div>
              <div className="context-switcher">
                {CONTEXTS.map((item) => {
                  const Icon = item.icon;
                  const active = currentContext === item.id;
                  const queued = queuedContext === item.id;
                  return (
                    <button key={item.id} className={cn("context-option", active && "active", queued && "queued")} onClick={() => requestContext(item.id)}>
                      {active && <motion.span className="context-active-bg" layoutId="context-bg" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                      <Icon size={15} /><span>{item.short}</span>{queued && <i />}
                    </button>
                  );
                })}
              </div>
              <div className="threat-control">
                <span>Threat</span>
                <input type="range" min="0" max="100" value={threat} onChange={(event) => handleThreat(Number(event.target.value))} style={{ "--value": `${threat}%` } as React.CSSProperties} />
                <strong>{threat}%</strong>
              </div>
              <button className={cn("event-button", victoryQueued && "queued")} onClick={queueVictory}>
                <Flag size={15} /> {victoryQueued ? "Flourish queued" : "Trigger victory"}
              </button>
            </section>

            <section className="composer-grid">
              <aside className="layers-panel">
                <div className="panel-heading">
                  <div><span>Sound world</span><strong>Layers</strong></div>
                  <button title="More layer options"><MoreHorizontal size={17} /></button>
                </div>
                <div className="layer-list">
                  {TRACKS.map((track) => (
                    <button key={track.id} className={cn("layer-row", selectedTrack === track.id && "selected")} onClick={() => setSelectedTrack(track.id)}>
                      <span className="layer-color" style={{ backgroundColor: track.color }} />
                      <span className="layer-copy"><strong>{track.name}</strong><small>{track.detail}</small></span>
                      <span className="mute-toggle" onClick={(event) => { event.stopPropagation(); toggleMute(track.id); }} role="button" tabIndex={0}>
                        {project.muted[track.id] ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="layer-note">
                  <ShieldCheck size={15} />
                  <div><strong>Harmony guard is on</strong><span>Every note stays inside {project.key} {project.scale}.</span></div>
                </div>
                <button className="reset-link" onClick={resetProject}><RotateCcw size={13} /> Restore starter score</button>
              </aside>

              <section className="sequence-panel">
                <div className="sequence-heading">
                  <div>
                    <span>Phrase editor</span>
                    <h1>Shape the motif</h1>
                    <p>Click notes and beats. The engine adds variation without leaving your scale.</p>
                  </div>
                  <div className="sequence-tools">
                    <button onClick={makeSparser}>Make sparser</button>
                    <button className="magic-button" onClick={composeMelody}><WandSparkles size={15} /> Compose for me</button>
                  </div>
                </div>

                <div className="roll-scroll">
                  <div className="piano-roll">
                    <div className="roll-corner"><span>NOTE</span></div>
                    {Array.from({ length: 16 }, (_, step) => (
                      <div key={`head-${step}`} className={cn("step-head", currentStep === step && playing && "current", step % 4 === 0 && "strong")}>
                        <span>{step + 1}</span>
                      </div>
                    ))}

                    {scaleLanes.map((lane) => (
                      <div className="roll-row" key={lane.degree}>
                        <div className={cn("note-label", lane.degree === 0 || lane.degree === 7 ? "root" : "")}>
                          <span>{lane.note.replace(/[0-9]/g, "")}</span><small>{lane.note.match(/[0-9]/)?.[0]}</small>
                        </div>
                        {Array.from({ length: 16 }, (_, step) => {
                          const active = project.melody[step] === lane.degree;
                          return (
                            <button
                              key={`${lane.degree}-${step}`}
                              className={cn("note-cell", active && "active", currentStep === step && playing && "current", step % 4 === 0 && "strong")}
                              onClick={() => setMelodyStep(step, lane.degree)}
                              aria-label={`${active ? "Remove" : "Add"} ${lane.note} at step ${step + 1}`}
                            >
                              {active && <motion.span layoutId={`note-${step}`} initial={{ scale: 0.5 }} animate={{ scale: 1 }} />}
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    <div className="roll-row chord-row">
                      <div className="automation-label"><span>CHORDS</span></div>
                      {Array.from({ length: 16 }, (_, step) => {
                        const degree = project.progression[Math.floor(step / 4)];
                        return <div key={`chord-${step}`} className={cn("automation-cell", currentStep === step && playing && "current", step % 4 === 0 && "strong")}>{step % 4 === 0 && <span>{chordLabel(project, degree)}</span>}</div>;
                      })}
                    </div>

                    {(["bass", "percussion"] as const).map((track) => (
                      <div className="roll-row automation-row" key={track}>
                        <div className="automation-label"><span>{track === "bass" ? "BASS" : "RHYTHM"}</span></div>
                        {project[track].map((active, step) => (
                          <button key={`${track}-${step}`} className={cn("automation-cell", active && "active", currentStep === step && playing && "current", step % 4 === 0 && "strong")} onClick={() => toggleBooleanStep(track, step)}>
                            {active && <i />}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="roll-footer">
                  <span><i className="legend-note" /> Written note</span>
                  <span><i className="legend-variation" /> Generated variation</span>
                  <p>Tip: fewer notes often feel more serene. Leave space for the reverb.</p>
                </div>
              </section>

              <aside className="refine-panel">
                <div className="panel-heading refine-heading">
                  <div><span>Selected layer</span><strong>{selectedTrackInfo.name}</strong></div>
                  <span className="selected-dot" style={{ background: selectedTrackInfo.color }} />
                </div>

                <div className="control-group">
                  <label className="select-label">Voice character
                    <select value={project.instrument} onChange={(event) => updateProject({ instrument: event.target.value as Project["instrument"] })}>
                      <option>Glass bell</option><option>Warm reed</option><option>Soft pluck</option>
                    </select>
                  </label>
                  <ParameterSlider label="Note density" value={project.density} onChange={(density) => updateProject({ density })} low="Airy" high="Busy" />
                  <ParameterSlider label="Safe variation" value={project.variation} onChange={(variation) => updateProject({ variation })} low="Repeat" high="Evolve" />
                  <ParameterSlider label="Human feel" value={project.humanize} onChange={(humanize) => updateProject({ humanize })} low="Exact" high="Loose" />
                </div>

                <div className="control-group atmosphere-group">
                  <div className="group-title"><span>Shared atmosphere</span><Sparkles size={14} /></div>
                  <ParameterSlider label="Reverb space" value={project.reverb} onChange={(reverb) => updateProject({ reverb })} low="Close" high="Vast" />
                  <ParameterSlider label="Rhythmic sway" value={project.swing} onChange={(swing) => updateProject({ swing })} low="Straight" high="Sway" />
                </div>

                <div className="progression-control">
                  <div className="group-title"><span>Chord path</span><CircleHelp size={14} /></div>
                  <select value={project.progressionName} onChange={(event) => {
                    const preset = PROGRESSIONS.find((item) => item.name === event.target.value)!;
                    updateProject({ progressionName: preset.name, progression: preset.degrees });
                  }}>
                    {PROGRESSIONS.map((item) => <option key={item.name}>{item.name}</option>)}
                  </select>
                  <div className="roman-progression">
                    {project.progression.map((degree, index) => <span key={`${degree}-${index}`}>{ROMAN[degree] ?? `${degree + 1}`}</span>)}
                  </div>
                  <p>These progressions are chosen to loop smoothly. You can change key without rebuilding them.</p>
                </div>
              </aside>
            </section>
          </motion.main>
        )}

        {tab === "runtime" && (
          <motion.main key="runtime" className="content-view runtime-view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <section className="content-intro">
              <span className="section-kicker">From editor to game</span>
              <h1>Let the world conduct.</h1>
              <p>Canopy waits for safe musical boundaries, then changes tempo, density, bass, and percussion in response to your game state.</p>
            </section>

            <section className="runtime-layout">
              <div className="event-lab">
                <div className="section-label"><span>01</span><strong>Test your event map</strong><small>Changes are heard live in the composer too</small></div>
                <div className="event-stage">
                  <div className="world-orbit">
                    <motion.div className={cn("orbit-core", `state-${currentContext}`)} animate={{ scale: playing ? [1, 1.035, 1] : 1 }} transition={{ repeat: playing ? Infinity : 0, duration: 3.4 }}>
                      {currentContext === "explore" ? <Leaf size={31} /> : currentContext === "unease" ? <Zap size={31} /> : <Sword size={31} />}
                      <strong>{activeContext.short}</strong>
                      <span>{playing ? "Score running" : "Score ready"}</span>
                    </motion.div>
                  </div>
                  <div className="event-actions">
                    <button onClick={() => requestContext("explore")}><Leaf size={16} /><span><strong>player.safe</strong><small>Return to exploration</small></span></button>
                    <button onClick={() => requestContext("unease")}><Zap size={16} /><span><strong>enemy.nearby</strong><small>Raise musical tension</small></span></button>
                    <button onClick={() => requestContext("combat")}><Sword size={16} /><span><strong>combat.started</strong><small>Add pulse and energy</small></span></button>
                    <button onClick={queueVictory}><Flag size={16} /><span><strong>combat.won</strong><small>Queue a one-bar flourish</small></span></button>
                  </div>
                  <button className="runtime-play" onClick={togglePlayback}>{playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause preview" : "Start live preview"}</button>
                </div>
              </div>

              <div className="implementation-panel">
                <div className="section-label"><span>02</span><strong>Wire it into your loop</strong><small>Export the runtime module first</small></div>
                <div className="install-line"><span>$</span><code>npm install tone</code><button onClick={() => navigator.clipboard.writeText("npm install tone")}><Copy size={14} /></button></div>
                <div className="code-block">
                  <div className="code-heading"><span>game-music.js</span><button onClick={copySnippet}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button></div>
                  <pre>{integrationSnippet}</pre>
                </div>
                <button className="download-runtime" onClick={exportRuntime}><Download size={15} /> Download {safeFileName(project.name)}.score.js</button>
              </div>
            </section>

            <section className="handoff-strip">
              <div><span>Browser audio rule</span><p>Call <code>startScore()</code> from a click, tap, or keypress. Browsers block audio before user interaction.</p></div>
              <div><span>Transition rule</span><p>State changes wait until the next bar, so combat never enters with an ugly mid-chord cut.</p></div>
              <div><span>Performance rule</span><p>Reuse one score instance. Call <code>disposeScore()</code> only when leaving the game entirely.</p></div>
            </section>
          </motion.main>
        )}

        {tab === "guide" && (
          <motion.main key="guide" className="content-view guide-view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <section className="content-intro guide-intro">
              <span className="section-kicker">A field guide for non-musicians</span>
              <h1>You do not need theory.<br />You need good constraints.</h1>
              <p>Canopy keeps notes in one scale, uses proven chord paths, and changes only a few musical dimensions at once. Your job is to choose the feeling.</p>
            </section>

            <section className="workflow-section">
              <div className="section-label"><span>01</span><strong>A reliable five-minute workflow</strong><small>Start here for every new game area</small></div>
              <div className="workflow-steps">
                {[
                  ["Choose a world", "Pick a key and scale. Major or Lydian feels bright; Dorian feels ancient; Minor feels shadowed."],
                  ["Choose a chord path", "Open sky and Homeward are dependable. The Roman numerals are just movable chord positions."],
                  ["Compose for me", "Generate a motif, then remove notes you dislike. Space usually sounds better than complexity."],
                  ["Test danger", "Move the Threat control slowly. Listen for the same identity surviving as the energy rises."],
                  ["Export both", "Use the Tone.js runtime in your game and MIDI if you want to polish the idea in a DAW later."],
                ].map(([title, copy], index) => (
                  <div className="workflow-step" key={title}><span>{String(index + 1).padStart(2, "0")}</span><strong>{title}</strong><p>{copy}</p></div>
                ))}
              </div>
            </section>

            <section className="hybrid-section">
              <div className="hybrid-copy">
                <span className="section-kicker">MIDI or Tone.js?</span>
                <h2>Use both, for different jobs.</h2>
                <p>MIDI is a compact list of notes, timing, and velocity. It is excellent for importing melodies and moving sketches between music tools, but it does not define the sound or how a score should react to danger.</p>
                <p>Tone.js is the realtime instrument and conductor. It schedules notes precisely, runs effects, and lets your game change layers and parameters while the music is playing.</p>
              </div>
              <div className="hybrid-diagram" aria-label="Recommended music architecture">
                <div><FileJson size={20} /><strong>Canopy project</strong><span>Motif, harmony, rules</span></div>
                <i>+</i>
                <div><Code2 size={20} /><strong>Tone.js runtime</strong><span>Synths, effects, context</span></div>
                <i>=</i>
                <div className="result"><Sparkles size={20} /><strong>Adaptive score</strong><span>Infinite, but recognizable</span></div>
              </div>
            </section>

            <section className="glossary-section">
              <div className="section-label"><span>02</span><strong>Only the words you need</strong><small>No conservatory required</small></div>
              <div className="glossary-grid">
                {[
                  ["Key", "The note that feels like home. Changing it moves the whole song higher or lower."],
                  ["Scale", "A safe palette of notes. Harmony guard prevents notes outside this palette."],
                  ["Chord", "Several notes heard together. Chords create the emotional landscape beneath a melody."],
                  ["Motif", "A short, memorable musical idea. Repetition makes it recognizable; variation keeps it alive."],
                  ["Density", "How often notes happen. Low density is spacious; high density adds urgency."],
                  ["Reverb", "The impression of a physical space. More reverb feels distant, dreamlike, or vast."],
                ].map(([term, meaning]) => <div key={term}><strong>{term}</strong><p>{meaning}</p></div>)}
              </div>
            </section>
          </motion.main>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
            <Check size={15} /> {toast}<button onClick={() => setToast("")}><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ParameterSlider({ label, value, onChange, low, high }: { label: string; value: number; onChange: (value: number) => void; low: string; high: string }) {
  return (
    <label className="parameter-slider">
      <span><strong>{label}</strong><b>{value}%</b></span>
      <input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ "--value": `${value}%` } as React.CSSProperties} />
      <small><i>{low}</i><i>{high}</i></small>
    </label>
  );
}

export default App;
