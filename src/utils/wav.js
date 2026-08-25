// Pure PCM -> WAV (RIFF) encoder. Takes one Float32Array per channel at the
// audio context's sample rate and returns a 16-bit PCM WAV ArrayBuffer.
// Tone-free and side-effect free so dev/tests can exercise it under node.

export function encodeWav(channels, sampleRate) {
  if (!Array.isArray(channels) || channels.length === 0 || channels.some((ch) => !(ch instanceof Float32Array))) {
    throw new Error("encodeWav expects a non-empty array of Float32Array channels");
  }
  const frameCount = channels[0].length;
  if (channels.some((ch) => ch.length !== frameCount)) {
    throw new Error("encodeWav channels must have equal length");
  }
  const channelCount = channels.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataBytes = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let ch = 0; ch < channelCount; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
