// Emitted-source part: the standalone runtime's live state, audio-graph
// setup, transport loop, and public API. This is the code a game actually
// calls; its API must stay stable (see AGENTS.md).
export const TRANSPORT_API_SRC = `let step = 0;
let loopId = null;
let nodes = null;
let voices = {};
let drumExtras = [];
let perfSteps = {};
let barCount = 0;
const restCounter = {};
const resting = {};
let liveAxes = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
// The axis vector liveAxes eases toward at each bar boundary. The game steers
// it with setGameAxes (partial merges; null restores the neutral default).
let axisTarget = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
let driftRng = Math.random;

// Which kit node realizes a percussion piece. Snare falls back to the hat on
// kits without a dedicated snare node, mirroring the studio dispatcher.
function kitNode(voice, piece) {
  const kit = voice?.kit;
  if (!kit) return null;
  switch (piece) {
    case "tom-hi":
    case "tom-lo":
    case "bongo-hi":
    case "bongo-lo": return kit.drum;
    case "rim":
    case "keyed":
    case "steel": return kit.tone;
    case "hat": return kit.hat;
    case "hat-open": return kit["hat-open"];
    case "shaker": return kit.shaker;
    case "snare": return kit.snare || kit.hat;
    case "kick": return kit.kick;
    default: return null;
  }
}

function setup() {
  const sp = score.space || { lead: 0.3, bed: 0.32, bass: 0.12, echo: 0.2 };
  const master = new Tone.Gain(0.74).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  const glue = new Tone.Compressor({ threshold: -20, ratio: 2.4, attack: 0.01, release: 0.25 }).connect(limiter);
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: score.reverb / 100 }).connect(glue);
  const delay = new Tone.FeedbackDelay("8n.", 0.28).connect(reverb);
  delay.wet.value = 0.25;
  const toneShaper = new Tone.Filter({ type: "lowpass", frequency: 7800 }).connect(glue);
  // Slow subtle chorus widens the harmony/pad path; space sends let each role
  // share the room as a controllable parallel tail (mirror of master-chain.js).
  const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.6, spread: 90, wet: 0.35 }).connect(toneShaper).start();
  // Dry stereo paths: the motif lands on the glue (clean + snappy), the
  // harmony path keeps its chorus/shaper character, bass is dry with a whisper.
  const motifBus = new Tone.Panner(-0.18).connect(glue);
  const harmonyBus = new Tone.Panner(0.18).connect(chorus);
  const bassBus = new Tone.Gain(1).connect(limiter);
  // Per-role parallel space sends into the shared reverb (+ lead echo).
  const leadSend = new Tone.Gain(sp.lead);
  motifBus.connect(leadSend);
  leadSend.connect(reverb);
  const echoSend = new Tone.Gain(sp.echo);
  motifBus.connect(echoSend);
  echoSend.connect(delay);
  const bedSend = new Tone.Gain(sp.bed);
  harmonyBus.connect(bedSend);
  bedSend.connect(reverb);
  const bassSend = new Tone.Gain(sp.bass);
  bassBus.connect(bassSend);
  bassSend.connect(reverb);
  nodes = { reverb, delay, glue, limiter, master, toneShaper, chorus, motifBus, harmonyBus, bassBus, leadSend, echoSend, bedSend, bassSend };
  drumExtras = [];
  voices = {};
  perfSteps = {};
  barCount = 0;
  for (const k of Object.keys(restCounter)) delete restCounter[k];
  for (const k of Object.keys(resting)) delete resting[k];
  for (const layer of score.layers) {
    if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
    if (layer.role === "harmony") {
      const cfg = resolveInstrumentConfig(layer, "harmony");
      const synth = makePitched("chords", cfg);
      let bundle;
      if (cfg.voice === "pluck") {
        bundle = { kind: "chords", ...makeVelocityPath(synth, harmonyBus) };
        nodes[layer.id] = bundle.velGain;
      } else {
        synth.connect(harmonyBus);
        bundle = { kind: "chords", synth };
        nodes[layer.id] = synth;
      }
      voices[layer.id] = bundle;
    } else if (layer.role === "motif") {
      const cfg = resolveInstrumentConfig(layer, "motif");
      const synth = makePitched("melody", cfg);
      let bundle;
      if (cfg.voice === "pluck") {
        bundle = { kind: "melody", ...makeVelocityPath(synth, motifBus) };
        nodes[layer.id] = bundle.velGain;
      } else {
        synth.connect(motifBus);
        bundle = { kind: "melody", synth };
        nodes[layer.id] = synth;
      }
      voices[layer.id] = bundle;
    } else if (layer.role === "bass") {
      const cfg = resolveInstrumentConfig(layer, "bass");
      const synth = cfg.voice === "pluck" ? makePitched("bass", cfg) : new Tone.MonoSynth({ ...cfg, volume: -11 });
      let bundle;
      if (cfg.voice === "pluck") {
        // PluckSynth ignores options.volume; carry the -11 dB role trim here.
        bundle = { kind: "bass", ...makeVelocityPath(synth, bassBus, Math.pow(10, -11 / 20)) };
        nodes[layer.id] = bundle.velGain;
      } else {
        synth.connect(bassBus);
        bundle = { kind: "bass", synth };
        nodes[layer.id] = synth;
      }
      voices[layer.id] = bundle;
    } else if (layer.role === "percussion") {
      const drums = makeDrums(layer.instrument, reverb, glue, score);
      voices[layer.id] = drums;
      nodes[layer.id] = drums; // dispose() skips non-disposable bundles; kit nodes live in drumExtras
      drumExtras.push(...drums.nodes, ...drums.extras);
    }
  }
  const transport = Tone.getTransport();
  transport.bpm.value = score.bpm;
  transport.swing = score.swing / 100 || 0;
  transport.swingSubdivision = "8n";
  loopId = transport.scheduleRepeat((time) => {
    const boundary = step === 0 || step === 8;
    if (boundary) {
      liveAxes = easeToward(liveAxes, axisTarget, 0.5);
      // Song-level bindings -> shared atmosphere (reverb/space/swing). Applied
      // only to the params that have a binding; the rest keep the static baseline.
      const ab = atmosphereBindings(score, liveAxes);
      if (ab.reverb !== undefined) nodes.reverb.wet.rampTo(ab.reverb / 100, 0.2);
      if (ab.swing !== undefined) Tone.getTransport().swing = ab.swing / 100;
      if (ab.space.lead !== undefined) nodes.leadSend.gain.rampTo(ab.space.lead, 0.2);
      if (ab.space.bed !== undefined) nodes.bedSend.gain.rampTo(ab.space.bed, 0.2);
      if (ab.space.bass !== undefined) nodes.bassSend.gain.rampTo(ab.space.bass, 0.2);
      if (ab.space.echo !== undefined) nodes.echoSend.gain.rampTo(ab.space.echo, 0.2);
    }
    if (step === 0) {
      barCount += 1;
      const journey = score.journey || { shape: "flat", length: 16, depth: 0 };
      const energy = journeyEnergy(journey.shape, journey.depth, barCount, journey.length);
      // v5 verse rotation: per-section dB delta + layer drop-in/out.
      const section = activeSection(score, barCount);
      for (const layer of score.layers) {
        restCounter[layer.id] = (restCounter[layer.id] || 0) + 1;
        const window = layer.restWindow || 0;
        resting[layer.id] =
          (window > 0 && restCounter[layer.id] % (window + 1) === 0) || !sectionActive(section, layer.id);
        const voice = voices[layer.id];
        if (!voice || layer.muted || resting[layer.id] || !layerActive(layer, liveAxes)) continue;
        const delta = journeyGain(layer, energy) + layerLevel(layer) + sectionGain(section, layer.id);
        if (voice.kind === "drums") {
          for (const node of Object.values(voice.kit || {})) {
            if (node && node.volume && node.baseVolume !== undefined) node.volume.rampTo(node.baseVolume + delta, 0.8);
          }
        } else if (voice.synth) {
          const base = voice.kind === "chords" ? -13 : voice.kind === "melody" ? -9 : -11;
          voice.synth.volume.rampTo(Math.max(-40, Math.min(0, base + delta)), 0.8);
        }
      }
    }
    if (boundary) {
      for (const layer of score.layers) {
        if (layer.role === "motif" && layer.variation > 0) {
          perfSteps[layer.id] = mutateMotif(layer.variation, layer.steps, driftRng);
        }
      }
    }
    const features = {};
    for (const layer of score.layers) features[layer.id] = { steps: perfSteps[layer.id] || layer.steps };
    const restingIds = Object.keys(resting).filter((id) => resting[id]);
    const events = orderEvents(computeStepFrame(score, liveAxes, { features, resting: restingIds }, step, driftRng));
    for (const ev of events) {
      const voice = voices[ev.layerId];
      if (!voice) continue;
      // Mute is a gate at the emission boundary, not a generation skip (the
      // core now keeps a muted layer's RNG stream intact). A muted layer still
      // renders its events here but they are NOT realized.
      if (score.layers.find((layer) => layer.id === ev.layerId)?.muted) continue;
      const when = time + (ev.offset || 0);
      // Pluck voices have no velocity parameter; their serial velocity gain
      // carries the note's expression instead.
      if (voice.velGain) voice.velGain.gain.setValueAtTime(voice.velGain.baseGain * ev.velocity, when);
      if (ev.kind === "chord") {
        voice.synth.triggerAttackRelease(chord(ev.degree), ev.duration, when, ev.velocity);
      } else if (ev.kind === "scale") {
        voice.synth.triggerAttackRelease(note(ev.degree, ev.octave), ev.duration, when, ev.velocity);
      } else {
        const node = kitNode(voice, ev.kind);
        if (!node) continue;
        if (node.drumKind === "noise") node.triggerAttackRelease(ev.duration || "16n", when, ev.velocity);
        else node.triggerAttackRelease(ev.pitch || note(ev.degree, ev.octave || 4), ev.duration || "16n", when, ev.velocity);
      }
    }
    step = (step + 1) % 16;
  }, "8n");
}

async function startScore() {
  await Tone.start();
  if (!nodes) setup();
  driftRng = makeRng(score.variationSeed || 0);
  Tone.getTransport().start();
}

function stopScore() {
  Tone.getTransport().stop();
  step = 0;
  driftRng = Math.random;
  barCount = 0;
  liveAxes = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
  axisTarget = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
  for (const k of Object.keys(restCounter)) delete restCounter[k];
  for (const k of Object.keys(resting)) delete resting[k];
  for (const layer of score.layers) {
    if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
  }
}

// Read-only snapshot of the runtime's live state — handy for game HUDs and
// test harnesses. Never mutates anything; additive, so older consumers that
// ignore it are unaffected.
function getRuntimeInfo() {
  return {
    playing: Tone.getTransport().state === "started",
    bar: barCount,
    liveAxes: { ...liveAxes },
    axisTarget: { ...axisTarget },
    sectionId: activeSection(score, barCount)?.id ?? null,
  };
}

// Steer the reactive axes: pass any subset of { intensity, tension, brightness }
// in 0..1 and liveAxes ease toward those values at each bar boundary. Partial
// objects merge over the current target; unlisted axes keep their target.
// Call setGameAxes(null) to reset to the neutral default. Games typically wrap
// this in their own named state setter, e.g. setMusicState("combat") =>
// setGameAxes({ intensity: 1, tension: 1, brightness: 0.35 }).
function setGameAxes(axes) {
  axisTarget = axes && typeof axes === "object"
    ? { ...axisTarget, ...axes }
    : { intensity: 0.3, tension: 0.25, brightness: 0.7 };
}

function disposeScore() {
  if (loopId !== null) Tone.getTransport().clear(loopId);
  Object.values(nodes || {}).forEach((node) => {
    if (Array.isArray(node)) node.forEach((child) => child.dispose());
    else node.dispose && node.dispose();
  });
  drumExtras.forEach((node) => node.dispose && node.dispose());
  drumExtras = [];
  nodes = null;
  voices = {};
}

  return { startScore, stopScore, getRuntimeInfo, setGameAxes, disposeScore };
`;
