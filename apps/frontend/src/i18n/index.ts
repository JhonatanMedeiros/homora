import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next, useTranslation } from 'react-i18next';
import { en, type MessageKey } from './en';
import { ptBR } from './pt-br';

export { apiError } from './api-errors';
export type Locale = 'en' | 'pt-BR';
export type { MessageKey };

export const locales: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pt-BR', label: 'Português (Brasil)' },
];

const i18n = i18next.createInstance();
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'pt-BR'],
    initAsync: false,
    keySeparator: false,
    nsSeparator: false,
    interpolation: { prefix: '{', suffix: '}', escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'homora-locale',
      caches: [],
      convertDetectedLanguage: (language: string) =>
        language.toLowerCase().startsWith('pt') ? 'pt-BR' : language,
    },
  });

function applyDocumentLocale(locale: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}
applyDocumentLocale(i18n.language);
i18n.on('languageChanged', applyDocumentLocale);

export function getLocale(): Locale {
  return i18n.language === 'pt-BR' ? 'pt-BR' : 'en';
}

export function setLocale(next: Locale) {
  if (next === getLocale()) return;
  try {
    localStorage.setItem('homora-locale', next);
  } catch {
    // The choice remains active for this page when storage is unavailable.
  }
  void i18n.changeLanguage(next);
}

export type Params = Record<string, string | number>;

/** Typed application keys; i18next resolves plurals and interpolates values. */
export function t(key: MessageKey, params?: Params): string {
  return i18n.t(key, params ?? {});
}

/** Translate a dynamic integration key, or display the integration's default text. */
export function tOr(key: string | undefined, fallback: string, params?: Params): string {
  return i18n.t(key ?? '', { ...params, defaultValue: fallback });
}

export function useI18n() {
  useTranslation(undefined, { i18n });
  return { t, locale: getLocale(), setLocale };
}

export const formatDateTime = (value: Date | string | number) =>
  new Intl.DateTimeFormat(getLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );

/** "12/11 21:08": day, month and time, for events close enough that the year is obvious. */
export const formatShortDateTime = (value: Date | string | number) =>
  new Intl.DateTimeFormat(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(value))
    .replace(',', '');

export const formatTime = (value: Date | string | number) =>
  new Intl.DateTimeFormat(getLocale(), { timeStyle: 'short' }).format(new Date(value));

/** "3 minutes ago" for past instants; coarse on purpose (minutes, hours, days). */
export function formatAgo(value: Date | string | number, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  if (seconds < 60) return rtf.format(0, 'minute');
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
  return rtf.format(-Math.floor(seconds / 86_400), 'day');
}

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  value.toLocaleString(getLocale(), options);

export const compareText = (a: string, b: string) => a.localeCompare(b, getLocale());
export const lower = (value: string) => value.toLocaleLowerCase(getLocale());
export const upper = (value: string) => value.toLocaleUpperCase(getLocale());
