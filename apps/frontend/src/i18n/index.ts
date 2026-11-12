import { useSyncExternalStore } from 'react';
import { en, type MessageKey } from './en';
import { ptBR } from './pt-br';

export { apiError } from './api-errors';
export type Locale = 'en' | 'pt-BR';
export type { MessageKey };

export const locales: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
];

const STORAGE_KEY = 'homora-locale';
const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, 'pt-BR': ptBR };

function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'pt-BR';
}

/** Saved locale, then browser locale (Portuguese becomes pt-BR); default is English. */
function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // No storage available: follow the browser language.
  }
  const preferred = typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  return preferred.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

function applyDocumentLocale() {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
applyDocumentLocale();

export function getLocale(): Locale {
  return current;
}

export function setLocale(next: Locale) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Selection only applies to this page session.
  }
  applyDocumentLocale();
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export type Params = Record<string, string | number>;

/**
 * Translates a key. `{name}` is replaced by `params.name`. With `count`, uses
 * the variant `key_one` or `key_other` based on the language's plural rules.
 */
export function t(key: MessageKey, params?: Params): string {
  const dictionary = dictionaries[current];
  let resolved: string = dictionary[key];
  if (params && typeof params.count === 'number') {
    const plural = new Intl.PluralRules(current).select(params.count);
    const variant = `${key}_${plural === 'one' ? 'one' : 'other'}` as MessageKey;
    resolved = dictionary[variant] ?? resolved;
  }
  if (!params) return resolved;
  return resolved.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Like `t` for keys that come from data (integration definitions): an unknown key falls back to
 * the English default text, so a definition never needs a message in every locale to work.
 */
export function tOr(key: string | undefined, fallback: string, params?: Params): string {
  const dictionary: Record<string, string> = dictionaries[current];
  const template =
    key !== undefined && Object.hasOwn(dictionary, key) ? dictionary[key]! : fallback;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Hook that re-renders on locale change and returns `t` and the current locale. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'en' as Locale);
  return { t, locale, setLocale };
}

export const formatDateTime = (value: Date | string | number) =>
  new Intl.DateTimeFormat(current, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );

export const formatTime = (value: Date | string | number) =>
  new Intl.DateTimeFormat(current, { timeStyle: 'short' }).format(new Date(value));

/** "3 minutes ago" for past instants; coarse on purpose (minutes, hours, days). */
export function formatAgo(value: Date | string | number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(current, { numeric: 'auto' });
  if (seconds < 60) return rtf.format(0, 'minute');
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
  return rtf.format(-Math.floor(seconds / 86_400), 'day');
}

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  value.toLocaleString(current, options);

export const compareText = (a: string, b: string) => a.localeCompare(b, current);
export const lower = (value: string) => value.toLocaleLowerCase(current);
export const upper = (value: string) => value.toLocaleUpperCase(current);
