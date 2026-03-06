/**
 * Lightweight i18n module for the desktop renderer.
 *
 * - Translations keyed by dot-path (e.g. "palette.squad")
 * - UI language stored in localStorage so it persists across sessions
 * - `applyTranslations()` updates all elements with `data-i18n` attribute
 * - `t(key)` for programmatic access
 */

import { CATALOGS, type Translations } from './i18n-catalogs.js';

export type { Translations };

const STORAGE_KEY = 'sauria-ui-language';

let currentLocale = localStorage.getItem(STORAGE_KEY) ?? 'en';

// ─── Public API ──────────────────────────────────────────────────────

export function t(key: string): string {
  return CATALOGS[currentLocale]?.[key] ?? CATALOGS.en![key] ?? key;
}

export function getLocale(): string {
  return currentLocale;
}

export function setLocale(locale: string): void {
  currentLocale = locale;
  localStorage.setItem(STORAGE_KEY, locale);
}

/**
 * Walk every element with `data-i18n` and update its text / placeholder.
 * - `data-i18n="key"` → sets `textContent`
 * - `data-i18n-placeholder="key"` → sets `placeholder`
 * - `data-i18n-title="key"` → sets `title`
 */
export function applyTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    el.textContent = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder!;
    (el as HTMLInputElement | HTMLTextAreaElement).placeholder = t(key);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.dataset.i18nTitle!;
    el.title = t(key);
  });
}

/** All available UI languages (for the language picker). */
export const UI_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'sv', label: 'Svenska' },
  { code: 'uk', label: 'Українська' },
] as const;
