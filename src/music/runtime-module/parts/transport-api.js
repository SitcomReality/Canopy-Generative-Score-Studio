// Emitted-source part: the standalone runtime's live state, audio-graph
// setup, transport loop, and public API. This is the code a game actually
// calls; its API must stay stable (see AGENTS.md).
export const TRANSPORT_API_SRC = `let context = "explore";
let queuedContext = null;
let flourishQueued = null;
let step = 0;
let loopId = null;
let nodes = null;
let voices = {};
let drumExtras = [];
let perfSteps = {};
let barCount = 0;
const restCounter = {};
const resting = {};
let liveAxes = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
// Manual axis targets (setGameAxes). When present, its entries override the
// active context's targets at each boundary; null restores context control.
let axisOverride = null;
let driftRng = Math.random;

function setup() {
  const master = new Tone.Gain(0.74).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  const glue = new Tone.Compressor({ threshold: -20, ratio: 2.4, attack: 0.01, release: 0.25 }).connect(limiter);
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: score.reverb / 100 }).connect(glue);
  const delay = new Tone.FeedbackDelay("8n.", 0.28).connect(reverb);
  delay.wet.value = 0.26;
  const toneShaper = new Tone.Filter({ type: "lowpass", frequency: 7800 }).connect(glue);
  // Slow subtle chorus widens the harmony/pad path; space sends let harmony
  // and bass share the room with the plucks (mirror of master-chain.js).
  const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.6, spread: 90, wet: 0.35 }).connect(toneShaper).start();
  const motifBus = new Tone.Panner(-0.18).connect(delay);
  const harmonyBus = new Tone.Panner(0.18).connect(chorus);
  const harmonySend = new Tone.Gain(0.4);
  harmonyBus.connect(harmonySend);
  harmonySend.connect(reverb);
  const bassBus = new Tone.Gain(1).connect(limiter);
  const bassSend = new Tone.Gain(0.12);
  bassBus.connect(bassSend);
  bassSend.connect(reverb);
  nodes = { reverb, delay, glue, limiter, master, toneShaper, chorus, motifBus, harmonyBus, harmonySend, bassBus, bassSend };
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
      const drums = makeDrums(layer.instrument, reverb, glue);
      voices[layer.id] = drums;
      nodes[layer.id] = { kick: drums.kick, hat: drums.hat };
      drumExtras.push(...drums.extras);
    }
  }
  const transport = Tone.getTransport();
  transport.bpm.value = score.bpm;
  transport.swing = score.swing / 100 || 0;
  transport.swingSubdivision = "8n";
  loopId = transport.scheduleRepeat((time) => {
    const boundary = step === 0 || step === 8;
    if (boundary && queuedContext) {
      context = queuedContext;
      queuedContext = null;
    }
    if (boundary) {
      const target = { ...contextTargets(score, context), ...(axisOverride ?? {}) };
      liveAxes = easeToward(liveAxes, target, 0.5);
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
          voice.kick.volume.rampTo(-10 + delta, 0.8);
          voice.hat.volume.rampTo(-24 + delta, 0.8);
          if (voice.snare) voice.snare.volume.rampTo(-14 + delta, 0.8);
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
      } else if (ev.kind === "kick") {
        voice.kick.triggerAttackRelease(ev.pitch || "D1", ev.duration, when, ev.velocity);
      } else if (ev.kind === "hat") {
        voice.hat.triggerAttackRelease(ev.duration || "32n", when, ev.velocity);
      } else if (ev.kind === "snare") {
        const target = voice.snare || voice.hat;
        target.triggerAttackRelease(ev.duration || "16n", when, ev.velocity);
      }
    }
    // One-shot flourish (v5): queued game milestones play across one bar via
    // the lead voice, then resolve the context they narrate.
    if (boundary && flourishQueued) {
      const lead = score.layers.find((layer) => layer.role === "motif" && !layer.muted);
      const synth = lead && voices[lead.id] ? voices[lead.id].synth : null;
      if (synth) {
        const spb = 60 / score.bpm;
        for (const ev of flourishEvents(score, flourishQueued)) {
          synth.triggerAttackRelease(note(ev.degree, ev.octave), ev.dur * spb, time + ev.at * spb, ev.vel);
        }
      }
      const resolve = { victory: "explore", defeat: "explore", calm: "explore", relief: "explore", combat: "combat", unease: "unease" }[flourishQueued] || "explore";
      context = resolve;
      queuedContext = null;
      liveAxes = easeToward(liveAxes, contextTargets(score, resolve), 1);
      flourishQueued = null;
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
  barCount = 0;
  liveAxes = { intensity: 0.3, tension: 0.25, brightness: 0.7 };
  for (const k of Object.keys(restCounter)) delete restCounter[k];
  for (const k of Object.keys(resting)) delete resting[k];
  for (const layer of score.layers) {
    if (layer.role === "motif") perfSteps[layer.id] = [...layer.steps];
  }
}

export function setGameMusicState({ threat = 0, inCombat = false } = {}) {
  queuedContext = inCombat || threat > 0.7 ? "combat" : threat > 0.3 ? "unease" : "explore";
}

// Queue a one-shot flourish by name: "victory", "defeat", "combat", "calm",
// "relief" or "unease" (the legacy boolean-style "victory" call is kept).
// The flourish plays at the next bar boundary and lasts a full bar.
export function musicEvent(name) {
  if (FLOURISH_NAMES.includes(name)) flourishQueued = name;
}

// Read-only snapshot of the runtime's live state — handy for game HUDs and
// test harnesses. Never mutates anything; additive, so older consumers that
// ignore it are unaffected.
export function getRuntimeInfo() {
  return {
    playing: Tone.getTransport().state === "started",
    context,
    bar: barCount,
    liveAxes: { ...liveAxes },
    axisOverride: axisOverride ? { ...axisOverride } : null,
    sectionId: activeSection(score, barCount)?.id ?? null,
  };
}

// Manually steer the reactive axes: pass any subset of { intensity, tension,
// brightness } in 0..1 and those axes ease toward your values at each bar
// boundary instead of the active context's targets. Unlisted axes (and the
// context itself) keep behaving normally; call setGameAxes(null) to hand
// control fully back to the context.
export function setGameAxes(axes) {
  axisOverride = axes && typeof axes === "object" ? { ...axes } : null;
}

export function disposeScore() {
  if (loopId !== null) Tone.getTransport().clear(loopId);
  Object.values(nodes || {}).forEach((node) => {
    if (Array.isArray(node)) node.forEach((child) => child.dispose());
    else node.dispose && node.dispose();
  });
  drumExtras.forEach((node) => node.dispose && node.dispose());
  drumExtras = [];
  nodes = null;
  voices = {};
}`;
