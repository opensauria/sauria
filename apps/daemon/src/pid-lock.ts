import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { paths } from './config/paths.js';

export function acquirePidLock(): void {
  const { pidFile } = paths;

  if (existsSync(pidFile)) {
    const existingPid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    if (!isNaN(existingPid)) {
      try {
        // Signal 0 checks if process exists without killing it
        process.kill(existingPid, 0);
        throw new Error(
          `Another daemon is already running (PID ${existingPid}). ` +
            `Remove ${pidFile} if the process is stale.`,
        );
      } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
          // Process doesn't exist — stale PID file, safe to overwrite
        } else {
          throw error;
        }
      }
    }
  }

  writeFileSync(pidFile, String(process.pid), 'utf-8');
}

export function releasePidLock(): void {
  try {
    const { pidFile } = paths;
    if (existsSync(pidFile)) {
      const storedPid = parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
      if (storedPid === process.pid) {
        unlinkSync(pidFile);
      }
    }
  } catch {
    // Best-effort cleanup
  }
}
