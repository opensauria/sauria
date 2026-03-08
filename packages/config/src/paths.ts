import { homedir } from 'node:os';
import { join } from 'node:path';

const SAURIA_HOME = process.env['SAURIA_HOME'] ?? join(homedir(), '.sauria');

export const paths = {
  home: SAURIA_HOME,
  config: join(SAURIA_HOME, 'config.json5'),
  db: join(SAURIA_HOME, 'sauria.db'),
  dbEncrypted: join(SAURIA_HOME, 'sauria.db.enc'),
  logs: join(SAURIA_HOME, 'logs'),
  tmp: join(SAURIA_HOME, 'tmp'),
  exports: join(SAURIA_HOME, 'exports'),
  vault: join(SAURIA_HOME, 'vault'),
  audit: join(SAURIA_HOME, 'audit.log'),
  canvas: join(SAURIA_HOME, 'canvas.json'),
  ownerCommands: join(SAURIA_HOME, 'owner-commands.jsonl'),
  pidFile: join(SAURIA_HOME, 'daemon.pid'),
  socket: join(SAURIA_HOME, 'daemon.sock'),
  ipcPort: join(SAURIA_HOME, 'daemon.port'),
  botProfiles: join(SAURIA_HOME, 'bot-profiles.json'),
} as const;

export type PathKey = keyof typeof paths;
