import { en, type MessageKey } from './en';
import { t } from './index';

/**
 * API error message in the active locale. The response provides `code` (stable, translated here) and
 * `error` (default English). Without a known code, it falls back to `error`, and finally to fallback.
 */
export function apiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const { code, error } = body as { code?: unknown; error?: unknown };
  const key = `apiError.${String(code)}`;
  if (typeof code === 'string' && key in en) return t(key as MessageKey);
  return typeof error === 'string' && error ? error : fallback;
}
