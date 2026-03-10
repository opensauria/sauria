/**
 * Formats Claude Code stream-json output for chat channels.
 *
 * Handles:
 * - Truncation per platform limits
 * - PII scrubbing before sending to external channels
 * - Stripping sensitive file paths
 */

import type { Platform } from '@sauria/types';
import { scrubPII } from '../security/pii-scrubber.js';

const PLATFORM_LIMITS: Readonly<Record<string, number>> = {
  telegram: 4000,
  slack: 3000,
  discord: 2000,
  whatsapp: 4000,
  email: 10_000,
};

const DEFAULT_LIMIT = 4000;

const SENSITIVE_PATH_PATTERNS = ['.sauria/', 'vault/', '.env'];

function stripSensitivePaths(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    // Replace file paths containing sensitive directories with redacted version
    const regex = new RegExp(
      `(/[^\\s]*${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\s]*)`,
      'g',
    );
    result = result.replace(regex, '[path redacted]');
  }
  return result;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const suffix = '\n\n... (truncated)';
  return text.slice(0, maxLength - suffix.length) + suffix;
}

export function formatCodeResponse(rawOutput: string, platform: Platform): string {
  const limit = PLATFORM_LIMITS[platform] ?? DEFAULT_LIMIT;

  let formatted = stripSensitivePaths(rawOutput);
  formatted = scrubPII(formatted);
  formatted = truncate(formatted, limit);

  return formatted;
}
