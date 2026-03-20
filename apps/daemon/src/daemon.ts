import { getLogger } from './utils/logger.js';
import { startDaemonContext, stopDaemonContext } from './daemon-lifecycle.js';
import type { DaemonContext } from './daemon-lifecycle.js';

let activeContext: DaemonContext | null = null;
let isShuttingDown = false;

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const logger = getLogger();

  if (activeContext) {
    try {
      await stopDaemonContext(activeContext);
    } catch (err: unknown) {
      logger.error('Error during shutdown', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    activeContext = null;
  }

  process.exit(0);
}

function installSignalHandlers(): void {
  if (process.platform !== 'win32') {
    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());
  }
  // Windows: parent process (Tauri) kills the child directly.
  // Also handle IPC 'shutdown' message when spawned as child process.
  process.on('message', (msg) => {
    if (msg === 'shutdown') void shutdown();
  });
}

export async function startDaemon(): Promise<void> {
  const logger = getLogger();

  installSignalHandlers();

  try {
    activeContext = await startDaemonContext();
  } catch (err: unknown) {
    // This catch only fires for failures BEFORE the status write in
    // startDaemonContext (db, config, security, IPC, orchestrator).
    // At this point stdout is still clean — write error there for Tauri,
    // and also to stderr as a reliable fallback (never captured by MCP).
    const message = err instanceof Error ? err.message : String(err);
    const errorLine = JSON.stringify({ status: 'error', message }) + '\n';
    logger.fatal('Daemon failed to start', { error: message });
    process.stdout.write(errorLine);
    process.stderr.write(errorLine);
    process.exit(1);
  }
}
