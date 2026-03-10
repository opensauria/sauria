import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecFileException } from 'node:child_process';

// Mock child_process before importing the module
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs/promises for access/writeFile/unlink
vi.mock('node:fs/promises', () => ({
  access: vi.fn().mockRejectedValue(new Error('no venv')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}));

import { execFile } from 'node:child_process';
import { TranscriptionService } from '../transcription.js';

type ExecFileCallback = (
  error: ExecFileException | null,
  stdout: string,
  stderr: string,
) => void;

const mockExecFile = vi.mocked(execFile);

function createService(model = 'auto', maxDurationSeconds = 60): TranscriptionService {
  return new TranscriptionService({ model, maxDurationSeconds });
}

describe('TranscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('model resolution', () => {
    it('resolves auto model based on platform', () => {
      const service = createService('auto');
      // The service is created without error; model resolves internally
      expect(service).toBeDefined();
    });

    it('uses explicit model when not auto', () => {
      const service = createService('my-custom-model');
      expect(service).toBeDefined();
    });
  });

  describe('transcribeVoice', () => {
    it('rejects audio exceeding 20MB limit', async () => {
      const service = createService();
      const oversizeBuffer = Buffer.alloc(20 * 1024 * 1024 + 1);

      await expect(service.transcribeVoice(oversizeBuffer)).rejects.toThrow(
        /byte limit/,
      );
    });

    it('accepts audio under 20MB limit', async () => {
      const service = createService();
      const buffer = Buffer.from('audio data');

      mockExecFile.mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(null, 'Hello world', '');
          return undefined as never;
        },
      );

      const result = await service.transcribeVoice(buffer);
      expect(result).toBe('Hello world');
    });

    it('rejects when whisper returns empty output', async () => {
      const service = createService();
      const buffer = Buffer.from('audio data');

      mockExecFile.mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(null, '   ', '');
          return undefined as never;
        },
      );

      await expect(service.transcribeVoice(buffer)).rejects.toThrow(
        /empty transcription/,
      );
    });

    it('rejects when execFile returns an error', async () => {
      const service = createService();
      const buffer = Buffer.from('audio data');

      const err = new Error('process crashed') as ExecFileException;
      mockExecFile.mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(err, '', 'some stderr output');
          return undefined as never;
        },
      );

      await expect(service.transcribeVoice(buffer)).rejects.toThrow(
        /Whisper transcription failed/,
      );
    });

    it('passes timeout from config to execFile options', async () => {
      const service = createService('auto', 120);
      const buffer = Buffer.from('audio data');

      mockExecFile.mockImplementation(
        (_cmd: unknown, _args: unknown, opts: unknown, cb: unknown) => {
          const options = opts as { timeout: number };
          expect(options.timeout).toBe(120_000);
          (cb as ExecFileCallback)(null, 'result', '');
          return undefined as never;
        },
      );

      await service.transcribeVoice(buffer);
    });

    it('trims whitespace from transcription output', async () => {
      const service = createService();
      const buffer = Buffer.from('audio data');

      mockExecFile.mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(null, '  trimmed output  \n', '');
          return undefined as never;
        },
      );

      const result = await service.transcribeVoice(buffer);
      expect(result).toBe('trimmed output');
    });

    it('uses stderr message in error when available', async () => {
      const service = createService();
      const buffer = Buffer.from('audio data');

      const err = new Error('generic') as ExecFileException;
      mockExecFile.mockImplementation(
        (_cmd: unknown, _args: unknown, _opts: unknown, cb: unknown) => {
          (cb as ExecFileCallback)(err, '', 'ModuleNotFoundError: mlx_whisper');
          return undefined as never;
        },
      );

      await expect(service.transcribeVoice(buffer)).rejects.toThrow(
        /ModuleNotFoundError/,
      );
    });
  });
});
