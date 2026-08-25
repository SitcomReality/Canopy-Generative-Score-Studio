// Float32 channels -> MP3 via the vendored lamejs UMD global. Encoding is
// synchronous; callers should expect a second or two for multi-minute takes
// and surface a toast while it runs.

const SAMPLES_PER_FRAME = 1152;

export function encodeMp3(channels, sampleRate, kbps = 192) {
  const encoderFactory = window.lamejs;
  if (!encoderFactory?.Mp3Encoder) throw new Error("lamejs global not loaded");
  if (!Array.isArray(channels) || channels.length === 0 || channels.some((ch) => !(ch instanceof Float32Array))) {
    throw new Error("encodeMp3 expects a non-empty array of Float32Array channels");
  }
  const channelCount = Math.min(channels.length, 2);
  const frameCount = channels[0].length;
  const encoder = new encoderFactory.Mp3Encoder(channelCount, sampleRate, kbps);
  const blocks = [];
  const toInt16 = (input) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output;
  };
  const left = toInt16(channels[0]);
  const right = channelCount > 1 ? toInt16(channels[1]) : null;
  for (let offset = 0; offset < frameCount; offset += SAMPLES_PER_FRAME) {
    const leftChunk = left.subarray(offset, offset + SAMPLES_PER_FRAME);
    const rightChunk = right ? right.subarray(offset, offset + SAMPLES_PER_FRAME) : undefined;
    const block = channelCount > 1 ? encoder.encodeBuffer(leftChunk, rightChunk) : encoder.encodeBuffer(leftChunk);
    if (block.length > 0) blocks.push(new Uint8Array(block));
  }
  const tail = encoder.flush();
  if (tail.length > 0) blocks.push(new Uint8Array(tail));
  return concat(blocks);
}

function concat(blocks) {
  const total = blocks.reduce((sum, block) => sum + block.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}
