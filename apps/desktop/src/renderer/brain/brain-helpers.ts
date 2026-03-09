import { t } from '../i18n.js';

export function formatTs(ts: string | null | undefined): string {
  if (!ts) return '-';
  const d = new Date(ts.includes('T') ? ts : ts + 'Z');
  if (isNaN(d.getTime())) return ts;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return t('brain.justNow');
  if (diff < 3600000) return Math.floor(diff / 60000) + t('brain.mAgo');
  if (diff < 86400000) return Math.floor(diff / 3600000) + t('brain.hAgo');
  if (diff < 604800000) return Math.floor(diff / 86400000) + t('brain.dAgo');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function escHtml(str: unknown): string {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

export function truncate(str: unknown, len: number): string {
  if (!str) return '';
  const s = String(str);
  return s.length > len ? s.slice(0, len) + '...' : s;
}

export function capitalize(str: unknown): string {
  if (!str) return '';
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const UPPER_WORDS = new Set(['id', 'url', 'api', 'uuid', 'ip', 'fts', 'ceo']);

export function toTitleCase(str: string): string {
  return str.replace(/_/g, ' ').replace(/\b\w+/g, (w) => {
    const lower = w.toLowerCase();
    if (UPPER_WORDS.has(lower)) return lower.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
}

export function parseJson(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(raw as string);
  } catch {
    return null;
  }
}
