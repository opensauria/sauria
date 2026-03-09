import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') process.exit(0);

const identity = process.env.APPLE_SIGNING_IDENTITY;
if (!identity) process.exit(0);

const nativeDeps = join(dirname(fileURLToPath(import.meta.url)), '..', 'native-deps');

function findNodeFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findNodeFiles(full));
    else if (entry.name.endsWith('.node')) results.push(full);
  }
  return results;
}

for (const file of findNodeFiles(nativeDeps)) {
  execFileSync(
    'codesign',
    ['--force', '--sign', identity, '--timestamp', '--options', 'runtime', file],
    { stdio: 'inherit' },
  );
}
