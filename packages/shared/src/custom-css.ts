/**
 * Custom CSS policy. The stylesheet is served from the server like any other file, so the rules
 * below keep it from calling out to other sites (privacy) or smuggling in script-like features.
 * It runs for everyone who sees Homora, including a future read-only guest.
 */
export const CUSTOM_CSS_MAX_BYTES = 20 * 1024;
export const CUSTOM_CSS_KEY = 'custom_css';
export const CUSTOM_CSS_ENABLED_KEY = 'custom_css_enabled';
export const CUSTOM_CSS_PATH = '/api/appearance/custom.css';

export type CustomCssProblem =
  | 'too-large'
  | 'control-characters'
  | 'markup'
  | 'import'
  | 'external-url'
  | 'script'
  | 'unbalanced';

/** Comments dropped and escapes decoded, so `@\69mport` or `u\72l(` cannot slip past the checks. */
function normalise(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '')
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\\\r?\n/g, '')
    .replace(/\\(.)/g, '$1')
    .toLowerCase();
}

/** Returns the first problem found, or `null` when the text may be stored and served. */
export function customCssProblem(css: string): CustomCssProblem | null {
  if (new TextEncoder().encode(css).length > CUSTOM_CSS_MAX_BYTES) return 'too-large';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(css)) return 'control-characters';
  const text = normalise(css);
  if (text.includes('<')) return 'markup';
  if (text.includes('@import')) return 'import';
  if (
    // Any address scheme or protocol-relative address, wherever it appears (url(), image-set(), strings).
    /(?:^|[^a-z0-9-])(?:https?|ftp|wss?|data|file|blob|about):/.test(text) ||
    text.includes('//') ||
    /url\(\s*['"]?\s*[a-z][a-z0-9+.-]*:/.test(text)
  )
    return 'external-url';
  if (/expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:/.test(text))
    return 'script';
  // Plain CSS: braces must pair up (strings are rare enough that a miscount only blocks a save).
  let depth = 0;
  for (const char of text) {
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth < 0) return 'unbalanced';
  }
  return depth === 0 ? null : 'unbalanced';
}
