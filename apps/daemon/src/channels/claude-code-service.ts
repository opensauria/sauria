/**
 * Claude Code CLI subprocess manager.
 *
 * Spawns `claude` in non-interactive mode (`--print`) with structured
 * JSON output, manages session persistence via `--resume`, and handles
 * permission mode enforcement.
 *
 * Security:
 * - Uses `execFile` (no shell interpolation)
 * - Filtered environment (allowlist only)
 * - Project path validation (absolute, exists, is directory, no sensitive dirs)
 */

import { execFile, type ChildProcess } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { CodePermissionMode } from '@sauria/types';
import { getLogger } from '../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 120_000;

const DENIED_PREFIXES = ['/etc/', '/var/', '/System/', '/usr/'];

/** Directories that must never be used as project paths. */
function isDeniedPath(resolved: string, home: string): boolean {
  const sauriaDir = join(home, '.sauria');
  if (resolved.startsWith(sauriaDir)) return true;
  if (resolved.includes('..')) return true;
  return DENIED_PREFIXES.some((p) => resolved.startsWith(p));
}

export function validateProjectPath(projectPath: string): string {
  if (!projectPath.startsWith('/')) {
    throw new Error('Project path must be absolute');
  }

  let resolved: string;
  try {
    resolved = realpathSync(projectPath);
  } catch {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  const home = process.env.HOME ?? '/';
  if (isDeniedPath(resolved, home)) {
    throw new Error(`Project path is in a restricted directory: ${resolved}`);
  }

  if (!statSync(resolved).isDirectory()) {
    throw new Error(`Project path is not a directory: ${resolved}`);
  }

  return resolved;
}

/**
 * Build environment for the Claude Code subprocess.
 *
 * Inherits the full parent env but strips all CLAUDE_CODE_* vars that
 * would make the subprocess think it's nested inside another session.
 * Auth is provided via ANTHROPIC_API_KEY (resolved from vault OAuth).
 */
function buildEnv(apiKey?: string): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };

  // Remove all Claude Code session vars — prevents nested session
  // detection and SSE port binding conflicts
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SSE_PORT;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  // Inject resolved API key (vault OAuth token or raw API key)
  if (apiKey) {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  return env;
}

interface StreamJsonEvent {
  readonly type: string;
  readonly content?: string;
  readonly session_id?: string;
  readonly subtype?: string;
}

export type ApiKeyResolver = () => Promise<string | null>;

export class ClaudeCodeService {
  private sessionId: string | null = null;
  private process: ChildProcess | null = null;
  private readonly projectPath: string;
  private permissionMode: CodePermissionMode;
  private readonly timeoutMs: number;
  private readonly resolveApiKey: ApiKeyResolver | null;
  private busy = false;

  constructor(config: {
    readonly projectPath: string;
    readonly permissionMode: CodePermissionMode;
    readonly timeoutMs?: number;
    readonly initialSessionId?: string;
    readonly resolveApiKey?: ApiKeyResolver;
  }) {
    this.projectPath = validateProjectPath(config.projectPath);
    this.permissionMode = config.permissionMode;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.sessionId = config.initialSessionId ?? null;
    this.resolveApiKey = config.resolveApiKey ?? null;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  setPermissionMode(mode: CodePermissionMode): void {
    this.permissionMode = mode;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  async sendMessage(content: string): Promise<string> {
    if (this.busy) {
      throw new Error('Claude Code session is busy processing another message');
    }

    this.busy = true;
    const logger = getLogger();

    try {
      const args = [
        '--print',
        '--output-format',
        'stream-json',
        '--permission-mode',
        this.permissionMode,
      ];

      if (this.sessionId) {
        args.push('--resume', this.sessionId);
      }

      args.push('-p', content);

      logger.info('Claude Code invocation', {
        projectPath: this.projectPath,
        permissionMode: this.permissionMode,
        hasSession: this.sessionId !== null,
        messagePreview: content.slice(0, 100),
      });

      const result = await this.exec(args);
      return this.parseStreamJson(result);
    } finally {
      this.busy = false;
    }
  }

  async resetSession(): Promise<void> {
    this.sessionId = null;
    this.stop();
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
      } catch {
        // Process already exited
      }
      this.process = null;
    }
    this.busy = false;
  }

  private async exec(args: readonly string[]): Promise<string> {
    const apiKey = await this.resolveApiKey?.().catch(() => null);

    return new Promise((resolve, reject) => {
      const child = execFile(
        'claude',
        [...args],
        {
          cwd: this.projectPath,
          env: buildEnv(apiKey ?? undefined),
          timeout: this.timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10 MB
        },
        (error, stdout, stderr) => {
          this.process = null;

          if (error) {
            const logger = getLogger();
            logger.error('Claude Code process error', {
              code: (error as NodeJS.ErrnoException).code,
              message: error.message,
              stderr: stderr.slice(0, 500),
            });
            reject(new Error(`Claude Code failed: ${error.message}`));
            return;
          }

          resolve(stdout);
        },
      );

      this.process = child;
    });
  }

  private parseStreamJson(raw: string): string {
    const lines = raw.split('\n').filter((l) => l.trim());
    const textParts: string[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as StreamJsonEvent;

        // Extract session ID for future --resume
        if (event.session_id) {
          this.sessionId = event.session_id;
        }

        // Accumulate assistant text
        if (event.type === 'assistant' && event.subtype === 'text' && event.content) {
          textParts.push(event.content);
        }

        // Also capture result messages
        if (event.type === 'result' && event.content) {
          textParts.push(event.content);
        }
      } catch {
        // Skip non-JSON lines
      }
    }

    return textParts.join('') || '(no response from Claude Code)';
  }
}
