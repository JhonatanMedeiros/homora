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

/** Idioma salvo, depois o do navegador (português vira pt-BR); o padrão é inglês. */
function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Sem armazenamento disponível: segue o idioma do navegador.
  }
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language;
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
    // A escolha vale só nesta página.
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
 * Traduz uma chave. `{nome}` é substituído por `params.nome`. Com `count`, usa a
 * variante `chave_one` ou `chave_other` conforme a regra de plural do idioma.
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

/** Hook que re-renderiza ao trocar de idioma e devolve `t` e o idioma atual. */
export function useI18n() {
  const locale = useSyncExternalStore(subscribe, getLocale, () => 'en' as Locale);
  return { t, locale, setLocale };
}

export const formatDateTime = (value: Date | string | number) =>
  new Intl.DateTimeFormat(current, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );

export const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
  value.toLocaleString(current, options);

export const compareText = (a: string, b: string) => a.localeCompare(b, current);
export const lower = (value: string) => value.toLocaleLowerCase(current);
export const upper = (value: string) => value.toLocaleUpperCase(current);
