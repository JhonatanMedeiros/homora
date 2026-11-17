import { afterEach, expect, it, vi } from 'vitest';
import { readProblems } from './widget-host';
afterEach(() => vi.unstubAllGlobals());
it('resolves portable scope names through the shared host reader before requesting problems', async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      urls.push(input);
      const body =
        input === '/api/groups'
          ? [{ id: 7, name: 'Media' }]
          : input === '/api/pages'
            ? [{ id: 4, name: 'Home' }]
            : { generatedAt: 1, items: [], total: 0, unmeasured: 0, truncated: false };
      return { ok: true, json: async () => body };
    }),
  );
  await readProblems(
    { limit: 5, groups: ['Media'], pages: ['Missing'], includeDegraded: false },
    new AbortController().signal,
  );
  const url = new URL(urls[2]!, 'http://example.test');
  expect(url.pathname).toBe('/api/widget-sources/monitoring/problems');
  expect(url.searchParams.get('groups')).toBe('7');
  expect(url.searchParams.get('pages')).toBe('0');
  expect(url.searchParams.get('includeDegraded')).toBe('false');
});
