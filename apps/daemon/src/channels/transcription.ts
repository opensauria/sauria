import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { writeFile, unlink } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const VENV_PYTHON = process.platform === 'win32'
  ? join(homedir(), '.opensauria', 'venv', 'Scripts', 'python.exe')
  : join(homedir(), '.opensauria', 'venv', 'bin', 'python3');
const AUTO_MODELS: Record<string, string> = {
  darwin: 'mlx-community/whisper-large-v3-turbo',
  linux: 'large-v3-turbo',
  win32: 'large-v3-turbo',
};

export interface TranscriptionConfig {
  readonly model: string;
  readonly maxDurationSeconds: number;
}

export class TranscriptionService {
  private readonly resolvedModel: string;

  constructor(private readonly config: TranscriptionConfig) {
    this.resolvedModel =
      config.model === 'auto' ? (AUTO_MODELS[process.platform] ?? 'large-v3-turbo') : config.model;
  }

  async transcribeVoice(oggBuffer: Buffer): Promise<string> {
    if (oggBuffer.byteLength > MAX_AUDIO_BYTES) {
      throw new Error(`Audio exceeds ${String(MAX_AUDIO_BYTES)} byte limit`);
    }

    const tmpPath = join(tmpdir(), `opensauria-${randomUUID()}.ogg`);
    try {
      await writeFile(tmpPath, oggBuffer);
      return await this.runWhisper(tmpPath);
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  private async runWhisper(audioPath: string): Promise<string> {
    switch (process.platform) {
      case 'darwin':
        return this.runMLXWhisper(audioPath);
      case 'linux':
      case 'win32':
        return this.runFasterWhisper(audioPath);
      default:
        throw new Error(`Unsupported platform for transcription: ${process.platform}`);
    }
  }

  private runMLXWhisper(audioPath: string): Promise<string> {
    const script = [
      'import sys',
      'import mlx_whisper',
      'result = mlx_whisper.transcribe(sys.argv[1], path_or_hf_repo=sys.argv[2])',
      'print(result["text"].strip())',
    ].join('\n');

    return this.execPython(script, [audioPath, this.resolvedModel]);
  }

  private runFasterWhisper(audioPath: string): Promise<string> {
    const script = [
      'import sys',
      'from faster_whisper import WhisperModel',
      'model = WhisperModel(sys.argv[2], compute_type="auto")',
      'segments, _ = model.transcribe(sys.argv[1])',
      'print(" ".join(s.text for s in segments).strip())',
    ].join('\n');

    return this.execPython(script, [audioPath, this.resolvedModel]);
  }

  private async resolvePython(): Promise<string> {
    try {
      await access(VENV_PYTHON);
      return VENV_PYTHON;
    } catch {
      return 'python3';
    }
  }

  private async execPython(script: string, args: readonly string[]): Promise<string> {
    const python = await this.resolvePython();
    const timeoutMs = this.config.maxDurationSeconds * 1000;

    return new Promise((resolve, reject) => {
      execFile(python, ['-c', script, ...args], { timeout: timeoutMs }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Whisper transcription failed: ${stderr || error.message}`));
          return;
        }
        const text = stdout.trim();
        if (!text) {
          reject(new Error('Whisper returned empty transcription'));
          return;
        }
        resolve(text);
      });
    });
  }
}
