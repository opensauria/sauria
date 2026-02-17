import { homedir } from 'node:os';
import { join } from 'node:path';

const OPENWIND_HOME = process.env['OPENWIND_HOME'] ?? join(homedir(), '.openwind');

export const paths = {
  home: OPENWIND_HOME,
  config: join(OPENWIND_HOME, 'config.json5'),
  db: join(OPENWIND_HOME, 'world.db'),
  dbEncrypted: join(OPENWIND_HOME, 'world.db.enc'),
  logs: join(OPENWIND_HOME, 'logs'),
  tmp: join(OPENWIND_HOME, 'tmp'),
  exports: join(OPENWIND_HOME, 'exports'),
  vault: join(OPENWIND_HOME, 'vault'),
  audit: join(OPENWIND_HOME, 'audit.log'),
  canvas: join(OPENWIND_HOME, 'canvas.json'),
  ceoCommands: join(OPENWIND_HOME, 'ceo-commands.jsonl'),
  pidFile: join(OPENWIND_HOME, 'daemon.pid'),
} as const;

export type PathKey = keyof typeof paths;
