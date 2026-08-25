// Live capture of the master mix. An inline AudioWorklet (loaded via blob URL,
// same trick as the runtime harness) taps Tone's destination and collects raw
// Float32 frames, so every browser yields identical PCM for WAV/MP3 encoding —
// no MediaRecorder container roulette. Like the engine, this uses the
// vendored Tone UMD global directly.

const PROCESSOR_NAME = "canopy-recorder";
const MAX_SECONDS = 300;

// Runs on the audio thread: copies each render quantum per channel until a
// stop message arrives or the duration cap is hit.
const PROCESSOR_SOURCE = `
class CanopyRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = [];
    this.right = [];
    this.frames = 0;
    this.capped = false;
    this.port.onmessage = (event) => {
      if (event.data === "stop") {
        this.port.postMessage({ left: this.left, right: this.right, capped: this.capped });
        this.left = [];
        this.right = [];
      }
    };
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0 && !this.capped) {
      this.left.push(new Float32Array(input[0]));
      // Duplicate to stereo when tapped after a mono source.
      this.right.push(new Float32Array(input[1] ?? input[0]));
      this.frames += input[0].length;
      if (this.frames >= sampleRate * ${MAX_SECONDS}) {
        this.capped = true;
        this.port.postMessage({ capped: true });
      }
    }
    return true;
  }
}
registerProcessor("${PROCESSOR_NAME}", CanopyRecorderProcessor);
`;

let session = null;
// AudioWorklet processors register globally per context; loading the module
// twice throws "already registered", so memoize by context.
const loadedContexts = new WeakSet();

async function ensureProcessorLoaded(rawContext) {
  if (loadedContexts.has(rawContext)) return;
  const blobUrl = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: "application/javascript" }));
  try {
    await rawContext.audioWorklet.addModule(blobUrl);
    loadedContexts.add(rawContext);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// Tone's Context wraps the native one; unwrap (starting from the destination's
// own context so the tap node and the mix share one context) until we reach a
// real BaseAudioContext for the worklet.
function nativeContext() {
  let candidate = Tone.getDestination().context?.rawContext ?? Tone.getContext().rawContext;
  while (candidate && !(candidate instanceof BaseAudioContext)) {
    candidate = candidate.rawContext ?? candidate._nativeContext ?? null;
  }
  if (!candidate) throw new Error("Could not reach the native audio context");
  return candidate;
}

export function isRecording() {
  return session !== null;
}

// Starts capturing whatever reaches Tone's destination (the full studio mix,
// including pluck voices that route straight toDestination).
export async function startRecording() {
  if (session) throw new Error("A recording is already running");
  const rawContext = nativeContext();
  await ensureProcessorLoaded(rawContext);
  const destination = Tone.getDestination();
  const node = new AudioWorkletNode(rawContext, PROCESSOR_NAME);
  // channelCount may only be pinned once the mode is "explicit" (the default
  // "max" rejects the assignment).
  node.channelCountMode = "explicit";
  node.channelCount = 2;
  // Tone.connect handles Tone -> native AudioNode wiring across wrappers;
  // Destination.connect() itself rejects foreign nodes with InvalidAccessError.
  Tone.connect(destination, node);
  session = { node };
}

// Stops the capture and resolves with one Float32Array per channel plus the
// context sample rate, ready for encodeWav()/encodeMp3().
export async function stopRecording() {
  const current = session;
  if (!current) throw new Error("No recording is running");
  session = null;
  const { node } = current;
  const result = await new Promise((resolve) => {
    node.port.onmessage = (event) => resolve(event.data);
    node.port.postMessage("stop");
  });
  node.port.onmessage = null;
  Tone.disconnect(Tone.getDestination(), node);
  node.disconnect();
  return { channels: mergeChannels(result), sampleRate: node.context.sampleRate, capped: result.capped };
}

function mergeChannels({ left, right }) {
  return [mergeFloat32(left), mergeFloat32(right)];
}

function mergeFloat32(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
