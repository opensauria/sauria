import { writeFileSync, renameSync, readdirSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import type { CanvasGraph } from './orchestrator/types.js';
import { getLogger } from './utils/logger.js';

const MAX_BACKUPS = 3;

function rotateBackups(filePath: string): void {
  const dir = dirname(filePath);
  const base = basename(filePath);
  const backupPrefix = `.${base}.bak.`;

  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(backupPrefix))
      .sort()
      .reverse();

    for (const old of files.slice(MAX_BACKUPS - 1)) {
      try {
        unlinkSync(join(dir, old));
      } catch {
        // best-effort cleanup
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${backupPrefix}${timestamp}`;
    if (existsSync(filePath)) {
      try {
        writeFileSync(join(dir, backupName), readFileSync(filePath), 'utf-8');
      } catch {
        // best-effort backup
      }
    }
  } catch {
    // best-effort rotation
  }
}

export function persistCanvasGraph(filePath: string, graph: CanvasGraph): void {
  rotateBackups(filePath);
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(graph, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function persistCanvasGraphDebounced(filePath: string, graph: CanvasGraph): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void (async () => {
      try {
        rotateBackups(filePath);
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, JSON.stringify(graph, null, 2), 'utf-8');
        await rename(tmpPath, filePath);
      } catch (error: unknown) {
        getLogger().warn('Failed to persist canvas graph (debounced)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, 300);
}
