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
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

export async function startDaemon(): Promise<void> {
  const logger = getLogger();

  installSignalHandlers();

  try {
    activeContext = await startDaemonContext();
    process.stdout.write('OpenWind daemon running. Press Ctrl+C to stop.\n');
  } catch (err: unknown) {
    logger.fatal('Daemon failed to start', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.stderr.write(
      `Fatal: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
