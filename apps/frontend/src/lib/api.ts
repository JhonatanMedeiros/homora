import { apiError } from '@/i18n';

/** Performs a fetch and parses JSON, throwing a translated API error when `!response.ok`. */
export async function requestJson(
  url: string,
  fallback: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiError(body, fallback));
  return body;
}
