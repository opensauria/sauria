const RIFF_HEADER_SIZE = 44;
const PCM_FORMAT = 1;
const MONO_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/** Merge an array of Float32Array chunks into a single flat Float32Array */
export function mergeChunks(chunks: readonly Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

/** Encode mono Float32 PCM samples to a 16-bit WAV Blob */
export function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const dataByteLength = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(RIFF_HEADER_SIZE + dataByteLength);
  const view = new DataView(buffer);

  const byteRate = sampleRate * MONO_CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = MONO_CHANNELS * BYTES_PER_SAMPLE;

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);              // sub-chunk size
  view.setUint16(20, PCM_FORMAT, true);      // audio format (1 = PCM)
  view.setUint16(22, MONO_CHANNELS, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  // PCM samples as Int16LE
  let byteOffset = RIFF_HEADER_SIZE;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    const int16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    view.setInt16(byteOffset, int16, true);
    byteOffset += BYTES_PER_SAMPLE;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
