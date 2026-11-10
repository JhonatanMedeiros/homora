import { en, type MessageKey } from './en';
import { t } from './index';

/**
 * Texto de um erro da API no idioma atual. A resposta traz `code` (estável, traduzido aqui) e
 * `error` (inglês padrão). Sem código conhecido, usa `error` e, por fim, o texto de reserva.
 */
export function apiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const { code, error } = body as { code?: unknown; error?: unknown };
  const key = `apiError.${String(code)}`;
  if (typeof code === 'string' && key in en) return t(key as MessageKey);
  return typeof error === 'string' && error ? error : fallback;
}
