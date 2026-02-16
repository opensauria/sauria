import { OUTBOUND_ALLOWLIST } from './url-allowlist.js';

export const SANDBOX_CONFIG = {
  denyRead: [
    '~/.ssh',
    '~/.gnupg',
    '~/.aws',
    '~/.azure',
    '~/.gcloud',
    '~/.config/gcloud',
    '~/.docker',
    '~/.kube',
    '~/.npmrc',
    '~/.pypirc',
    '~/.netrc',
    '~/.git-credentials',
    '~/.password-store',
    '~/.1password',
    '~/.bitwarden',
    '~/.mozilla',
    '/etc/shadow',
    '/etc/sudoers',
  ],
  allowWrite: ['~/.openwind'],
  network: {
    allowedDomains: [...OUTBOUND_ALLOWLIST],
  },
} as const;

export async function initializeOSSandbox(): Promise<boolean> {
  try {
    // OS-level sandbox runtime is not yet integrated.
    // This stub returns false and logs a warning so callers
    // can gracefully degrade without hard-failing startup.
    console.warn('[openwind] OS-level sandbox: not yet integrated');
    return false;
  } catch {
    console.warn('[openwind] OS-level sandbox: initialization failed');
    return false;
  }
}
