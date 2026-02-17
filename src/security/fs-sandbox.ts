import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { paths } from '../config/paths.js';

export class PathTraversalError extends Error {
  override readonly name = 'PathTraversalError';

  constructor(requestedPath: string) {
    super(`Path traversal blocked: "${requestedPath}" is outside OPENWIND_HOME`);
  }
}

export function safePath(requestedPath: string): string {
  const resolved = resolve(requestedPath);
  const allowed = resolve(paths.home);

  if (resolved !== allowed && !resolved.startsWith(allowed + sep)) {
    throw new PathTraversalError(requestedPath);
  }

  return resolved;
}

export async function safeReadFile(filePath: string): Promise<Buffer> {
  const safe = safePath(filePath);
  return readFile(safe);
}

export async function safeWriteFile(filePath: string, data: string | Buffer): Promise<void> {
  const safe = safePath(filePath);
  await mkdir(dirname(safe), { recursive: true });
  await writeFile(safe, data);
}

export async function safeMkdir(dirPath: string): Promise<void> {
  const safe = safePath(dirPath);
  await mkdir(safe, { recursive: true });
}
