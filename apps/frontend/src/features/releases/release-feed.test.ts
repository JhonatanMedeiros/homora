// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareVersions, fetchReleases, hasUpdate, parseReleases } from './release-feed';

afterEach(() => vi.unstubAllGlobals());

describe('release versions', () => {
  it.each([
    ['v0.2.0', 'v0.1.9', 1],
    ['v1.0.0', 'v1.0.0-beta.2', 1],
    ['v1.0.0-beta.10', 'v1.0.0-beta.2', 1],
    ['v1.0.0-alpha', 'v1.0.0', -1],
    ['v1.0.0', '1.0.0', 0],
    ['v01.0.0', 'v1.0.0', null],
  ])('compares %s and %s', (a, b, expected) => expect(compareVersions(a, b)).toBe(expected));
});

it('only indicates an update when an identified installation is older', () => {
  const newer = [{ tag: 'v0.2.0', title: '', body: '', date: '2026-01-01' }];
  expect(hasUpdate('v0.1.0', newer)).toBe(true);
  expect(hasUpdate('v0.2.0', newer)).toBe(false);
  expect(hasUpdate('v0.3.0', newer)).toBe(false);
  expect(hasUpdate(null, newer)).toBe(false);
});

const entry = (
  tag: string,
  content = '&lt;h3&gt;News&lt;/h3&gt;&lt;ul&gt;&lt;li&gt;Hello&lt;/li&gt;&lt;/ul&gt;',
) =>
  `<entry><link rel="alternate" href="https://github.com/JhonatanMedeiros/homora/releases/tag/${tag}"/><title>Release</title><updated>2026-01-01T00:00:00Z</updated><content type="html">${content}</content></entry>`;
const feed = (contents: string) =>
  `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">${contents}</feed>`;

it('parses stable releases and safely converts release HTML into plain notes', () => {
  const parsed = parseReleases(feed(entry('v0.1.0') + entry('v0.2.0-beta.1') + entry('bad')));
  expect(parsed).toHaveLength(1);
  expect(parsed[0]).toMatchObject({
    tag: 'v0.1.0',
    title: 'Release',
    date: '2026-01-01T00:00:00Z',
  });
  expect(parsed[0].body).toContain('### News');
  expect(parsed[0].body).toContain('- Hello');
});

it('preserves GitHub pull request and commit links from an escaped Atom entry', () => {
  const html =
    '&lt;ul&gt;&lt;li&gt;Improved setup (&lt;a href=&quot;https://github.com/JhonatanMedeiros/homora/pull/230&quot;&gt;#230&lt;/a&gt;) (&lt;a href=&quot;https://github.com/JhonatanMedeiros/homora/commit/abc&quot;&gt;abc&lt;/a&gt;)&lt;/li&gt;&lt;/ul&gt;';
  const [release] = parseReleases(feed(entry('v0.1.0', html)));
  expect(release.body).toContain('[#230](https://github.com/JhonatanMedeiros/homora/pull/230)');
  expect(release.body).toContain('[abc](https://github.com/JhonatanMedeiros/homora/commit/abc)');
});

it('rejects DTDs and ignores links outside the fixed project', () => {
  expect(() =>
    parseReleases('<!DOCTYPE feed [<!ENTITY x SYSTEM "file:///etc/passwd">]><feed/>'),
  ).toThrow();
  expect(
    parseReleases(
      feed(entry('v0.1.0').replace('github.com/JhonatanMedeiros', 'example.test/other')),
    ),
  ).toEqual([]);
});

it('reads only the authenticated same-origin endpoint and does not follow redirects', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ feed: feed('') }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(fetchReleases(new AbortController().signal)).resolves.toEqual([]);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/release-notes',
    expect.objectContaining({ redirect: 'error' }),
  );
});

it('rejects oversized, malformed and unavailable responses', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(new Response('x'.repeat(2_000_001)));
  fetchMock.mockResolvedValueOnce(new Response('not xml'));
  fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
  for (let i = 0; i < 3; i++)
    await expect(fetchReleases(new AbortController().signal)).rejects.toThrow();
});
