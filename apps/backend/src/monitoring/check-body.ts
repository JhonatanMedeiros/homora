import { getOwnPath } from '@homora/utils';

/** Largest response the content checks read (the network helper caps bodies at 2 MB). */
export const CONTENT_CHECK_MAX_BYTES = 1_000_000;

/** Does the response contain `keyword`? Case-insensitive, so "OK" matches "ok". */
export function matchesKeyword(body: string, keyword: string): boolean {
  return body.toLocaleLowerCase().includes(keyword.toLocaleLowerCase());
}

/** `a.b.0.c`: object keys and array indexes only; no expressions, so nothing in a config can run code. */
function valueAt(root: unknown, path: string): unknown {
  return getOwnPath(root, path.split('.'), { allowNumericArrayKeys: true });
}

/**
 * `path=value` passes when the JSON value at `path` prints as `value` (numbers, booleans and strings
 * alike); a bare `path` passes when the value exists and is not null or false.
 */
export function matchesJson(body: string, expression: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // A body that is not JSON cannot match the expected value.
    return false;
  }
  const split = expression.indexOf('=');
  const path = (split === -1 ? expression : expression.slice(0, split)).trim();
  if (!path) return false;
  const found = valueAt(parsed, path);
  if (split === -1) return found !== undefined && found !== null && found !== false;
  if (found === undefined || found === null || typeof found === 'object') return false;
  return String(found) === expression.slice(split + 1).trim();
}
