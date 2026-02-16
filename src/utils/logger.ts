import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { scrubPII } from '../security/pii-scrubber.js';
import { safePath } from '../security/fs-sandbox.js';
import { paths } from '../config/paths.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  readonly level: LogLevel;
  readonly timestamp: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

const LOG_LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const RETENTION_DAYS = 30;
const API_KEY_PATTERN = /\b(sk|pk|key|token|secret|password)[_-]?[a-zA-Z0-9]{8,}\b/gi;

function stripApiKeys(text: string): string {
  return text.replace(API_KEY_PATTERN, '[KEY_REDACTED]');
}

function sanitizeLogOutput(text: string): string {
  return stripApiKeys(scrubPII(text));
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLogEntry(entry: LogEntry): string {
  const base = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`;
  if (!entry.context || Object.keys(entry.context).length === 0) {
    return base;
  }
  const contextStr = JSON.stringify(entry.context);
  return `${base} ${sanitizeLogOutput(contextStr)}`;
}

function getLogFilePath(date: Date): string {
  const logsDir = safePath(paths.logs);
  return join(logsDir, `openwind-${formatDate(date)}.log`);
}

function ensureLogsDir(): void {
  const logsDir = safePath(paths.logs);
  mkdirSync(logsDir, { recursive: true });
}

function pruneOldLogs(): void {
  const logsDir = safePath(paths.logs);
  let files: string[];
  try {
    files = readdirSync(logsDir);
  } catch {
    return;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = formatDate(cutoff);

  for (const file of files) {
    if (!file.startsWith('openwind-') || !file.endsWith('.log')) continue;
    const dateStr = file.slice('openwind-'.length, -'.log'.length);
    if (dateStr < cutoffStr) {
      try {
        unlinkSync(join(logsDir, file));
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

export class Logger {
  private minLevel: number;
  private lastPruneDate = '';

  constructor(level: LogLevel = 'info') {
    this.minLevel = LOG_LEVEL_PRIORITY[level];
    ensureLogsDir();
  }

  setLevel(level: LogLevel): void {
    this.minLevel = LOG_LEVEL_PRIORITY[level];
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log('fatal', message, context);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < this.minLevel) return;

    const now = new Date();
    const entry: LogEntry = {
      level,
      timestamp: now.toISOString(),
      message: sanitizeLogOutput(message),
      context,
    };

    const line = formatLogEntry(entry);
    const filePath = getLogFilePath(now);

    try {
      appendFileSync(filePath, `${line}\n`, 'utf-8');
    } catch {
      process.stderr.write(`[openwind] Failed to write log: ${line}\n`);
    }

    this.pruneIfNeeded(now);
  }

  private pruneIfNeeded(now: Date): void {
    const today = formatDate(now);
    if (today === this.lastPruneDate) return;
    this.lastPruneDate = today;
    pruneOldLogs();
  }
}

let defaultLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger();
  }
  return defaultLogger;
}
