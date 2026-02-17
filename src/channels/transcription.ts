import type {
  AutomaticSpeechRecognitionPipeline,
  AutomaticSpeechRecognitionOutput,
} from '@huggingface/transformers';

const WHISPER_SAMPLE_RATE = 16_000;
const DEFAULT_OGG_SAMPLE_RATE = 48_000;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export interface TranscriptionConfig {
  readonly model: string;
  readonly maxDurationSeconds: number;
}

export class TranscriptionService {
  private pipeline: AutomaticSpeechRecognitionPipeline | null = null;

  constructor(private readonly config: TranscriptionConfig) {}

  async init(): Promise<void> {
    if (this.pipeline) return;

    const { pipeline } = await import('@huggingface/transformers');
    this.pipeline = (await pipeline(
      'automatic-speech-recognition',
      this.config.model,
    )) as AutomaticSpeechRecognitionPipeline;
  }

  async transcribeVoice(oggBuffer: Buffer): Promise<string> {
    if (oggBuffer.byteLength > MAX_AUDIO_BYTES) {
      throw new Error(`Audio file exceeds ${String(MAX_AUDIO_BYTES)} byte limit`);
    }

    const pcm = await this.decodeOggOpus(oggBuffer);
    return this.transcribe(pcm);
  }

  private async transcribe(pcm: Float32Array): Promise<string> {
    await this.init();

    const maxSamples = this.config.maxDurationSeconds * WHISPER_SAMPLE_RATE;
    const input = pcm.length > maxSamples ? pcm.slice(0, maxSamples) : pcm;

    const result = (await this.pipeline!(input, {
      chunk_length_s: 30,
      stride_length_s: 5,
    })) as AutomaticSpeechRecognitionOutput;

    return result.text.trim();
  }

  private async decodeOggOpus(oggBuffer: Buffer): Promise<Float32Array> {
    const { OggOpusDecoder } = await import('ogg-opus-decoder');

    const decoder = new OggOpusDecoder();
    await decoder.ready;

    const decoded = await decoder.decodeFile(new Uint8Array(oggBuffer));
    decoder.free();

    const mono = mixToMono(decoded.channelData);
    return downsample(mono, DEFAULT_OGG_SAMPLE_RATE, WHISPER_SAMPLE_RATE);
  }
}

function mixToMono(channelData: Float32Array[]): Float32Array {
  const first = channelData[0];
  if (!first) throw new Error('No audio channel data');
  if (channelData.length === 1) return first;

  const { length } = first;
  const mono = new Float32Array(length);
  const channelCount = channelData.length;
  const scale = 1 / channelCount;

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let ch = 0; ch < channelCount; ch++) {
      sum += channelData[ch]?.[i] ?? 0;
    }
    mono[i] = sum * scale;
  }

  return mono;
}

function downsample(
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array {
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const lower = Math.floor(srcIndex);
    const upper = Math.min(lower + 1, input.length - 1);
    const fraction = srcIndex - lower;
    output[i] = (input[lower] ?? 0) * (1 - fraction) + (input[upper] ?? 0) * fraction;
  }

  return output;
}
