/**
 * Claude CLI provider — routes LLM calls through `claude -p` for
 * Anthropic subscription-based access to Sonnet/Opus/Haiku.
 *
 * Per-agent session persistence via --resume keeps conversation
 * continuity and avoids creating new Claude sessions per message.
 * The routing prompt includes full context each time (persona,
 * tools, conversation history) so the model always has what it needs.
 *
 * Security:
 * - Uses `spawn` with no shell (no interpolation)
 * - Prompt piped via stdin (handles arbitrary content safely)
 * - Filtered environment (strips CLAUDE_CODE_* vars)
 */

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { getLogger } from '../../utils/logger.js';

const DEFAULT_TIMEOUT_MS = 120_000;

interface JsonResult {
  readonly type: string;
  readonly result?: string;
  readonly session_id?: string;
}

export interface ClaudeCliResult {
  readonly text: string;
  readonly sessionId: string | null;
}

/**
 * Build environment for the Claude CLI subprocess.
 * Inherits parent env but strips session vars to avoid nesting conflicts.
 */
function buildEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SSE_PORT;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  return env;
}

export class ClaudeCliService {
  private static available: boolean | null = null;
  private readonly sessions = new Map<string, string>();

  /**
   * Check if the `claude` CLI binary is available on PATH.
   * Result is cached after first check.
   */
  static async isAvailable(): Promise<boolean> {
    if (ClaudeCliService.available !== null) return ClaudeCliService.available;

    return new Promise((resolve) => {
      const child = spawn('claude', ['--version'], { timeout: 5_000, stdio: 'ignore' });
      child.on('close', (code) => {
        ClaudeCliService.available = code === 0;
        resolve(code === 0);
      });
      child.on('error', () => {
        ClaudeCliService.available = false;
        resolve(false);
      });
    });
  }

  /** Restore a session from persisted canvas graph data. */
  setSession(nodeId: string, sessionId: string): void {
    this.sessions.set(nodeId, sessionId);
  }

  /** Get current session ID for a node. */
  getSession(nodeId: string): string | null {
    return this.sessions.get(nodeId) ?? null;
  }

  /**
   * Send a prompt to Claude CLI with the specified model tier.
   * Resumes existing session per agent for conversation continuity.
   * Prompt is piped via stdin — safe for any size/content.
   */
  async query(
    nodeId: string,
    modelTier: 'sonnet' | 'opus' | 'haiku',
    prompt: string,
  ): Promise<ClaudeCliResult> {
    const logger = getLogger();
    const sessionId = this.sessions.get(nodeId);

    const args = ['--print', '--output-format', 'json', '--model', modelTier];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    logger.info('Claude CLI invocation', {
      nodeId,
      modelTier,
      hasSession: sessionId !== undefined,
      promptLength: prompt.length,
    });

    const raw = await this.exec(args, prompt);
    return this.parseJsonResult(nodeId, raw);
  }

  /** Reset session for a specific agent node. */
  resetSession(nodeId: string): void {
    this.sessions.delete(nodeId);
  }

  /**
   * Spawn `claude` with args, pipe prompt via stdin, collect stdout.
   */
  private exec(args: readonly string[], stdin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('claude', [...args], {
        cwd: tmpdir(),
        env: buildEnv(),
        timeout: DEFAULT_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          const logger = getLogger();
          logger.error('Claude CLI process error', {
            code,
            stderr: stderr.slice(0, 500),
          });
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 200)}`));
          return;
        }
        resolve(stdout);
      });

      child.on('error', (error) => {
        const logger = getLogger();
        logger.error('Claude CLI spawn error', {
          message: error.message,
        });
        reject(new Error(`Claude CLI failed: ${error.message}`));
      });

      child.stdin.write(stdin);
      child.stdin.end();
    });
  }

  private parseJsonResult(nodeId: string, raw: string): ClaudeCliResult {
    try {
      const result = JSON.parse(raw.trim()) as JsonResult;

      if (result.session_id) {
        this.sessions.set(nodeId, result.session_id);
      }

      return {
        text: result.result || '(no response from Claude CLI)',
        sessionId: result.session_id ?? this.sessions.get(nodeId) ?? null,
      };
    } catch {
      const logger = getLogger();
      logger.warn('Claude CLI output is not valid JSON, using raw text', {
        nodeId,
        rawLength: raw.length,
      });

      return {
        text: raw.trim() || '(no response from Claude CLI)',
        sessionId: this.sessions.get(nodeId) ?? null,
      };
    }
  }
}
