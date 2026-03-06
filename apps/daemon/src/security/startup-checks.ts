import { chmod, stat } from 'node:fs/promises';
import { paths } from '../config/paths.js';
import { SECURITY_LIMITS } from './rate-limiter.js';

export class SecurityCheckError extends Error {
  override readonly name = 'SecurityCheckError';

  constructor(check: string, detail: string) {
    super(`Security check failed [${check}]: ${detail}`);
  }
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

export async function enforceFilePermissions(filePath: string, mode: number): Promise<void> {
  if (process.platform === 'win32') return;

  try {
    const info = await stat(filePath);
    const currentMode = info.mode & 0o777;

    if (currentMode !== mode) {
      await chmod(filePath, mode);
    }
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return; // File doesn't exist yet (first run)
    }
    throw err;
  }
}

function checkNotRoot(): void {
  if (process.platform === 'win32') return;

  const uid = process.getuid?.();

  if (uid === 0) {
    throw new SecurityCheckError('root', 'Refusing to run as root user');
  }
}

async function checkHomeOwnership(): Promise<void> {
  if (process.platform === 'win32') return;

  try {
    const info = await stat(paths.home);
    const currentUid = process.getuid?.();

    if (currentUid !== undefined && info.uid !== currentUid) {
      throw new SecurityCheckError(
        'ownership',
        `${paths.home} is owned by uid ${info.uid}, expected ${currentUid}`,
      );
    }
  } catch (err: unknown) {
    if (err instanceof SecurityCheckError) {
      throw err;
    }
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return; // First run, directory doesn't exist yet
    }
    throw err;
  }
}

async function checkHomePermissions(): Promise<void> {
  await enforceFilePermissions(paths.home, 0o700);
}

async function checkConfigPermissions(): Promise<void> {
  await enforceFilePermissions(paths.config, 0o600);
}

async function checkDbPermissions(): Promise<void> {
  await enforceFilePermissions(paths.db, 0o600);
}

function checkNodeVersion(): void {
  const [majorStr] = process.version.slice(1).split('.');
  const major = Number(majorStr);

  if (major < 22) {
    throw new SecurityCheckError(
      'node_version',
      `Node.js >= 22 required, found ${process.version}`,
    );
  }
}

async function checkDatabaseSize(): Promise<void> {
  try {
    const info = await stat(paths.db);

    if (info.size >= SECURITY_LIMITS.database.maxSizeHardLimitBytes) {
      throw new SecurityCheckError(
        'db_size',
        `Database size ${info.size} exceeds hard limit of ${SECURITY_LIMITS.database.maxSizeHardLimitBytes}`,
      );
    }

    if (info.size >= SECURITY_LIMITS.database.maxSizeWarnBytes) {
      console.warn(`[sauria] Warning: database size ${info.size} exceeds warning threshold`);
    }
  } catch (err: unknown) {
    if (err instanceof SecurityCheckError) {
      throw err;
    }
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return; // Database doesn't exist yet
    }
    throw err;
  }
}

function checkDebugger(): void {
  const hasInspect = process.execArgv.some((arg) => arg.includes('inspect'));

  if (hasInspect) {
    throw new SecurityCheckError('debugger', 'Debugger attachment detected via --inspect flag');
  }
}

export async function runSecurityChecks(): Promise<void> {
  checkNotRoot();
  checkNodeVersion();
  checkDebugger();

  await checkHomeOwnership();
  await checkHomePermissions();
  await checkConfigPermissions();
  await checkDbPermissions();
  await checkDatabaseSize();
}
