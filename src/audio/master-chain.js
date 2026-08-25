// Master audio graph for the studio preview: output chain, shared space
// effects, and the per-role stereo buses. Pure construction — no sequencing,
// no project parsing beyond the song-level reverb setting.
//
// Signal flow:
//   motif bus    -> delay -> reverb --\
//   hats         ---------------------> reverb -> glue compressor -> limiter -> master
//   harmony bus  -> chorus -> tone shaper -> glue   (+ reverb send)
//   bass bus ---------------------------------------> limiter (+ subtle reverb send)
//   kick, snare ------------------------------------> glue / limiter (dry)

export function createMasterChain(project) {
  const master = new Tone.Gain(0.74).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  // Gentle glue compression ahead of the limiter so stacked layers stop
  // squashing into a "kicked" sound; pitched voices get an air shelf and a
  // little stereo width.
  const glue = new Tone.Compressor({ threshold: -20, ratio: 2.4, attack: 0.01, release: 0.25 }).connect(limiter);
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: project.reverb / 100 }).connect(glue);
  const delay = new Tone.FeedbackDelay("8n.", 0.28).connect(reverb);
  delay.wet.value = 0.26;
  const toneShaper = new Tone.Filter({ type: "lowpass", frequency: 7800 }).connect(glue);
  // Slow subtle chorus widens the harmony/pad path — the mid-range "glue"
  // between high plucks and the sub-bass.
  const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.6, spread: 90, wet: 0.35 })
    .connect(toneShaper)
    .start();
  const motifBus = new Tone.Panner(-0.18).connect(delay);
  const harmonyBus = new Tone.Panner(0.18).connect(chorus);
  // Space sends: harmony rides a moderate reverb wash, bass only a whisper,
  // so the whole track shares one room instead of just the plucks.
  const harmonySend = new Tone.Gain(0.4);
  harmonyBus.connect(harmonySend);
  harmonySend.connect(reverb);
  const bassBus = new Tone.Gain(1).connect(limiter);
  const bassSend = new Tone.Gain(0.12);
  bassBus.connect(bassSend);
  bassSend.connect(reverb);

  const nodes = [
    master, limiter, glue, reverb, delay, toneShaper, chorus,
    motifBus, harmonyBus, harmonySend, bassBus, bassSend,
  ];

  return {
    master,
    limiter,
    glue,
    reverb,
    delay,
    toneShaper,
    chorus,
    motifBus,
    harmonyBus,
    harmonySend,
    bassBus,
    bassSend,
    setReverb(value) {
      reverb.wet.rampTo(value / 100, 0.2);
    },
    dispose() {
      nodes.forEach((node) => node.dispose());
    },
  };
}
