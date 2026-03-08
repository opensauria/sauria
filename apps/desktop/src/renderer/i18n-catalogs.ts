export type { Translations } from './i18n/types.js';

import type { Translations } from './i18n/types.js';
import en from './i18n/en.js';

const loaded: Record<string, Translations> = { en };

const LOADERS: Record<string, () => Promise<{ default: Translations }>> = {
  fr: () => import('./i18n/fr.js'),
  es: () => import('./i18n/es.js'),
  de: () => import('./i18n/de.js'),
  it: () => import('./i18n/it.js'),
  pt: () => import('./i18n/pt.js'),
  ru: () => import('./i18n/ru.js'),
  ja: () => import('./i18n/ja.js'),
  zh: () => import('./i18n/zh.js'),
  ko: () => import('./i18n/ko.js'),
  ar: () => import('./i18n/ar.js'),
  hi: () => import('./i18n/hi.js'),
  tr: () => import('./i18n/tr.js'),
  nl: () => import('./i18n/nl.js'),
  pl: () => import('./i18n/pl.js'),
  sv: () => import('./i18n/sv.js'),
  uk: () => import('./i18n/uk.js'),
};

export async function loadLocale(code: string): Promise<Translations> {
  if (loaded[code]) return loaded[code];
  const loader = LOADERS[code];
  if (!loader) return en;
  const mod = await loader();
  loaded[code] = mod.default;
  return mod.default;
}

export const CATALOGS: Readonly<Record<string, Translations>> = loaded;
