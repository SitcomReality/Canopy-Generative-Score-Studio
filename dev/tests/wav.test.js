// Tests for the WAV export encoder: RIFF/WAVE header layout, PCM payload
// size, and quantization of the float samples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav } from "../../src/utils/wav.js";

function readHeader(buffer) {
  const view = new DataView(buffer);
  const ascii = (offset, length) =>
    Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
  return {
    riff: ascii(0, 4),
    wave: ascii(8, 4),
    fmt: ascii(12, 4),
    data: ascii(36, 4),
    chunkSize: view.getUint32(4, true),
    audioFormat: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataBytes: view.getUint32(40, true),
    bufferBytes: buffer.byteLength,
  };
}

test("encodeWav writes a well-formed stereo RIFF header", () => {
  const left = new Float32Array([0, 0.5, -0.5]);
  const right = new Float32Array([0.25, -0.25, 1]);
  const header = readHeader(encodeWav([left, right], 48000));
  assert.equal(header.riff, "RIFF");
  assert.equal(header.wave, "WAVE");
  assert.equal(header.fmt, "fmt ");
  assert.equal(header.data, "data");
  assert.equal(header.audioFormat, 1);
  assert.equal(header.channels, 2);
  assert.equal(header.sampleRate, 48000);
  assert.equal(header.bitsPerSample, 16);
  assert.equal(header.blockAlign, 4);
  assert.equal(header.byteRate, 48000 * 4);
  assert.equal(header.dataBytes, 3 * 4);
  assert.equal(header.chunkSize, 36 + header.dataBytes);
  assert.equal(header.bufferBytes, 44 + header.dataBytes);
});

test("encodeWav supports mono and interleaves channels frame by frame", () => {
  const left = new Float32Array([1, -1]);
  const right = new Float32Array([-0.5, 0.5]);
  const buffer = encodeWav([left, right], 44100);
  const view = new DataView(buffer);
  // Negative samples scale by 0x8000, positives by 0x7fff.
  const expected = [0x7fff, -16384, -0x8000, Math.trunc(0.5 * 0x7fff)];
  for (let i = 0; i < expected.length; i += 1) {
    assert.equal(view.getInt16(44 + i * 2, true), expected[i], `sample ${i}`);
  }
  // Clamping keeps full-scale input inside Int16 range.
  assert.equal(new DataView(encodeWav([new Float32Array([2])], 44100)).getInt16(44, true), 0x7fff);
});

test("encodeWav rejects mismatched or empty channel data", () => {
  assert.throws(() => encodeWav([], 44100));
  assert.throws(() => encodeWav([new Float32Array([0]), new Float32Array([0, 0])], 44100));
  assert.throws(() => encodeWav([new Float64Array([0])], 44100));
});
