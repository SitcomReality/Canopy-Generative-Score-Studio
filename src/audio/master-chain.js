// Master audio graph for the studio preview: output chain, shared space
// effects, and the per-role stereo buses. Pure construction — no sequencing,
// no project parsing beyond the song-level reverb and space settings.
//
// Signal flow (each pitched tone keeps a DRY path; the room is a parallel tail):
//   motif bus   ------> glue  (dry)                \
//   motif bus   -> lead send -> reverb              \
//   motif bus   -> echo send -> delay -> reverb      \
//   harmony bus -> chorus -> tone shaper -> glue  (dry)
//   harmony bus -> bed send -> reverb
//   bass bus    --------------------------> limiter (dry)
//   bass bus    -> bass send -> reverb
//   hats        ---------------------> reverb -> glue compressor -> limiter -> master
//   reverb, glue -----------------------------------------> limiter
//
// Because the sends are parallel, a voice is never forced into the wash — the
// dry note always reaches the glue/limiter, and `space.lead`/`space.bed`/
// `space.bass`/`space.echo` control how much tail each role carries.

const DEFAULT_SPACE = { lead: 0.3, bed: 0.32, bass: 0.12, echo: 0.2 };

export function createMasterChain(project) {
  const space = project.space ?? DEFAULT_SPACE;
  const master = new Tone.Gain(0.74).toDestination();
  const limiter = new Tone.Limiter(-1).connect(master);
  // Gentle glue compression ahead of the limiter so stacked layers stop
  // squashing into a "kicked" sound; pitched voices get an air shelf and a
  // little stereo width.
  const glue = new Tone.Compressor({ threshold: -20, ratio: 2.4, attack: 0.01, release: 0.25 }).connect(limiter);
  const reverb = new Tone.Reverb({ decay: 5.5, preDelay: 0.08, wet: project.reverb / 100 }).connect(glue);
  // Echo/space "character": a feedback delay that only the lead carries, fed by
  // its parallel echo send (echo 0 leaves the delay silent).
  const delay = new Tone.FeedbackDelay("8n.", 0.28).connect(reverb);
  delay.wet.value = 0.25;
  const toneShaper = new Tone.Filter({ type: "lowpass", frequency: 7800 }).connect(glue);
  // Slow subtle chorus widens the harmony/pad path — the mid-range "glue"
  // between high plucks and the sub-bass.
  const chorus = new Tone.Chorus({ frequency: 0.6, delayTime: 3.5, depth: 0.6, spread: 90, wet: 0.35 })
    .connect(toneShaper)
    .start();

  // Dry stereo paths. Motif lands straight on the glue (clean + snappy); the
  // harmony path keeps its chorus/tone-shaper character; bass is dry with a
  // whisper of room.
  const motifBus = new Tone.Panner(-0.18).connect(glue);
  const harmonyBus = new Tone.Panner(0.18).connect(chorus);
  const bassBus = new Tone.Gain(1).connect(limiter);

  // Per-role parallel space sends. These are the controllable "room" — how
  // much of each role rides the shared reverb, and how much echo the lead has.
  const leadSend = new Tone.Gain(space.lead);
  motifBus.connect(leadSend);
  leadSend.connect(reverb);
  const echoSend = new Tone.Gain(space.echo);
  motifBus.connect(echoSend);
  echoSend.connect(delay);
  const bedSend = new Tone.Gain(space.bed);
  harmonyBus.connect(bedSend);
  bedSend.connect(reverb);
  const bassSend = new Tone.Gain(space.bass);
  bassBus.connect(bassSend);
  bassSend.connect(reverb);

  const nodes = [
    master, limiter, glue, reverb, delay, toneShaper, chorus,
    motifBus, harmonyBus, bassBus,
    leadSend, echoSend, bedSend, bassSend,
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
    bassBus,
    leadSend,
    echoSend,
    bedSend,
    bassSend,
    setReverb(value) {
      reverb.wet.rampTo(value / 100, 0.2);
    },
    setSpace(next) {
      leadSend.gain.rampTo(next?.lead ?? space.lead, 0.2);
      echoSend.gain.rampTo(next?.echo ?? space.echo, 0.2);
      bedSend.gain.rampTo(next?.bed ?? space.bed, 0.2);
      bassSend.gain.rampTo(next?.bass ?? space.bass, 0.2);
    },
    dispose() {
      nodes.forEach((node) => node.dispose());
    },
  };
}
