/**
 * Owner profile resolution — full name and profile photo from OS.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';

export function resolveOwnerFullName(): string {
  const fallback = userInfo().username;
  try {
    const os = platform();
    if (os === 'darwin') {
      const name = execFileSync('/usr/bin/id', ['-F'], {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      if (name) return name;
    } else if (os === 'linux') {
      const gecos = execFileSync('/usr/bin/getent', ['passwd', fallback], {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      const field = gecos.split(':')[4]?.split(',')[0]?.trim();
      if (field) return field;
    } else if (os === 'win32') {
      const raw = execFileSync('net', ['user', fallback], {
        encoding: 'utf-8',
        timeout: 3000,
      });
      const match = raw.match(/Full Name\s+(.*)/i);
      const name = match?.[1]?.trim();
      if (name) return name;
    }
  } catch {
    /* fallback to username */
  }
  return fallback;
}

export function resolveOwnerPhoto(): string | null {
  try {
    const os = platform();

    if (os === 'darwin') {
      const raw = execFileSync(
        '/usr/bin/dscl',
        ['.', '-read', `/Users/${userInfo().username}`, 'JPEGPhoto'],
        {
          encoding: 'utf-8',
          timeout: 5000,
          maxBuffer: 2 * 1024 * 1024,
        },
      );
      const hex = raw.split('\n').slice(1).join('').replace(/\s+/g, '');
      if (hex.length > 0) {
        return `data:image/jpeg;base64,${Buffer.from(hex, 'hex').toString('base64')}`;
      }
    } else if (os === 'linux') {
      const facePath = join(homedir(), '.face');
      if (existsSync(facePath)) {
        const buf = readFileSync(facePath);
        if (buf.length > 0) {
          const isPng = buf[0] === 0x89 && buf[1] === 0x50;
          const mime = isPng ? 'image/png' : 'image/jpeg';
          return `data:${mime};base64,${buf.toString('base64')}`;
        }
      }
    } else if (os === 'win32') {
      const picDir = join(
        homedir(),
        'AppData',
        'Roaming',
        'Microsoft',
        'Windows',
        'AccountPictures',
      );
      if (existsSync(picDir)) {
        const raw = execFileSync(
          'powershell',
          [
            '-NoProfile',
            '-Command',
            `Get-ChildItem '${picDir}' -Filter *.accountpicture-ms | Sort-Object Length -Descending | Select-Object -First 1 -ExpandProperty FullName`,
          ],
          { encoding: 'utf-8', timeout: 5000 },
        ).trim();
        if (raw && existsSync(raw)) {
          const buf = readFileSync(raw);
          const jpegStart = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
          if (jpegStart >= 0) {
            const jpegEnd = buf.indexOf(Buffer.from([0xff, 0xd9]), jpegStart);
            if (jpegEnd >= 0) {
              const jpeg = buf.subarray(jpegStart, jpegEnd + 2);
              return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
            }
          }
        }
      }
    }
  } catch {
    /* no profile photo */
  }
  return null;
}
