import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface BannedPatternViolation {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
  readonly content: string;
}

export const BANNED_PATTERNS: ReadonlyArray<string> = [
  'child_process',
  '.exec(',
  '.execSync(',
  '.spawn(',
  'new Function(',
  'eval(',
  'vm.run',
  'process.binding',
  'net.createServer',
  'http.createServer',
  'https.createServer',
  'WebSocketServer',
  '.listen(',
  'express()',
  '0.0.0.0',
];

async function collectTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory() && entry.name !== 'node_modules') {
      const nested = await collectTsFiles(fullPath);
      results.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

export async function scanForBannedPatterns(
  srcDir: string,
): Promise<BannedPatternViolation[]> {
  const violations: BannedPatternViolation[] = [];
  const files = await collectTsFiles(srcDir);

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i];
      if (lineContent === undefined) {
        continue;
      }

      for (const pattern of BANNED_PATTERNS) {
        if (lineContent.includes(pattern)) {
          violations.push({
            file,
            line: i + 1,
            pattern,
            content: lineContent.trim(),
          });
        }
      }
    }
  }

  return violations;
}

export async function assertNoBannedPatterns(srcDir: string): Promise<void> {
  const violations = await scanForBannedPatterns(srcDir);

  if (violations.length === 0) {
    return;
  }

  const summary = violations
    .map((v) => `  ${v.file}:${v.line} - found "${v.pattern}"`)
    .join('\n');

  throw new Error(
    `Banned pattern violations found (${violations.length}):\n${summary}`,
  );
}
