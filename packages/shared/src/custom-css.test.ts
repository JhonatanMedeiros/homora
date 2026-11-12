import { describe, expect, it } from 'vitest';
import { CUSTOM_CSS_MAX_BYTES, customCssProblem } from './custom-css.js';

describe('customCssProblem', () => {
  it('accepts ordinary plain CSS, variables and data hooks', () => {
    expect(
      customCssProblem(`
        /* Make the cards rounder */
        :root { --primary: #2f7d6b; --radius-card: 1rem; }
        [data-homora="service-card"] { border-radius: var(--radius-card); }
        @media (max-width: 600px) { [data-homora="top-bar"] > span { display: none; } }
        .x::after { content: "ok"; background: url(#local); }
      `),
    ).toBeNull();
    expect(customCssProblem('')).toBeNull();
  });

  it.each([
    ['@import', '@import "x.css";', 'import'],
    ['@import with a url', "@import url('x.css');", 'import'],
    ['@import hidden by an escape', '@\\69mport "x.css";', 'import'],
    ['@import split by a comment', '@/**/import "x.css";', 'import'],
    ['an https url', 'a { background: url(https://tracker.example/p.png); }', 'external-url'],
    [
      'a quoted https url',
      "a { background: url('https://tracker.example/p.png'); }",
      'external-url',
    ],
    ['a protocol-relative url', 'a { background: url(//tracker.example/p.png); }', 'external-url'],
    ['an escaped scheme', 'a { background: u\\72l(ht\\74ps://x.example/a.png); }', 'external-url'],
    ['a data url', 'a { background: url(data:image/png;base64,AAAA); }', 'external-url'],
    [
      'image-set to another site',
      'a { background: image-set("https://x.example/a.png" 1x); }',
      'external-url',
    ],
    [
      'a font from another site',
      '@font-face { font-family: x; src: url(HTTPS://x.example/f.woff2); }',
      'external-url',
    ],
    [
      'a url with spaces and a scheme',
      'a { background: url(  "ftp://x/a.png" ); }',
      'external-url',
    ],
    ['expression()', 'a { width: expression(alert(1)); }', 'script'],
    ['javascript:', 'a { background: url(javascript:alert(1)); }', 'external-url'],
    ['javascript: alone', 'a { content: "javascript:alert(1)"; }', 'script'],
    ['-moz-binding', 'a { -moz-binding: none; }', 'script'],
    ['markup', 'a { } </style><script>alert(1)</script>', 'markup'],
    ['a stray closing brace', 'a { } }', 'unbalanced'],
    ['an unclosed block', 'a { color: red;', 'unbalanced'],
    ['a null byte', 'a { color: red; }\u0000', 'control-characters'],
  ])('rejects %s', (_name, css, problem) => {
    expect(customCssProblem(css)).toBe(problem);
  });

  it('limits the size by bytes, not characters', () => {
    const ok = `a{content:"${'x'.repeat(CUSTOM_CSS_MAX_BYTES - 13)}"}`;
    expect(new TextEncoder().encode(ok).length).toBe(CUSTOM_CSS_MAX_BYTES);
    expect(customCssProblem(ok)).toBeNull();
    expect(customCssProblem(ok + ' ')).toBe('too-large');
    // 3 bytes each: well under 20 000 characters, over the limit in bytes.
    expect(customCssProblem(`a{content:"${'€'.repeat(7000)}"}`)).toBe('too-large');
  });
});
