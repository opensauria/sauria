import { homedir } from 'node:os';
import { join } from 'node:path';

const OPENSAURIA_HOME = process.env['OPENSAURIA_HOME'] ?? join(homedir(), '.opensauria');

export const paths = {
  home: OPENSAURIA_HOME,
  config: join(OPENSAURIA_HOME, 'config.json5'),
  db: join(OPENSAURIA_HOME, 'opensauria.db'),
  dbEncrypted: join(OPENSAURIA_HOME, 'opensauria.db.enc'),
  logs: join(OPENSAURIA_HOME, 'logs'),
  tmp: join(OPENSAURIA_HOME, 'tmp'),
  exports: join(OPENSAURIA_HOME, 'exports'),
  vault: join(OPENSAURIA_HOME, 'vault'),
  audit: join(OPENSAURIA_HOME, 'audit.log'),
  canvas: join(OPENSAURIA_HOME, 'canvas.json'),
  ownerCommands: join(OPENSAURIA_HOME, 'owner-commands.jsonl'),
  pidFile: join(OPENSAURIA_HOME, 'daemon.pid'),
  socket: join(OPENSAURIA_HOME, 'daemon.sock'),
  ipcPort: join(OPENSAURIA_HOME, 'daemon.port'),
  botProfiles: join(OPENSAURIA_HOME, 'bot-profiles.json'),
} as const;

export type PathKey = keyof typeof paths;
