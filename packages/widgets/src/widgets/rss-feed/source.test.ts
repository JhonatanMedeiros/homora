import { describe, expect, it, vi } from 'vitest';
import {
  SourceParseError,
  SourcePolicyBlockedError,
  type WidgetSourceContext,
} from '../../source.js';
import { MAX_FEED_BYTES } from './parser.js';
import { rssFeedSource } from './source.js';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Homelab Feed</title>
    <item>
      <title>First</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 16 Nov 2026 10:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second</title>
      <link>https://example.com/2</link>
      <pubDate>Tue, 17 Nov 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('rss-feed source reader', () => {
  it('validates query parameters and normalizes cache keys', () => {
    expect(rssFeedSource.parseQuery({})).toBeNull();
    expect(rssFeedSource.parseQuery({ url: 'ftp://example.com/feed.xml' })).toBeNull();
    expect(
      rssFeedSource.parseQuery({ url: 'https://example.com/feed.xml', limit: '0' }),
    ).toBeNull();
    expect(
      rssFeedSource.parseQuery({ url: 'https://example.com/feed.xml', limit: '11' }),
    ).toBeNull();
    expect(
      rssFeedSource.parseQuery({
        url: 'https://example.com/feed.xml',
        allowPrivateNetwork: 'maybe',
      }),
    ).toBeNull();

    const parsed = rssFeedSource.parseQuery({
      url: ' https://example.com/feed.xml ',
      limit: '3',
      allowPrivateNetwork: 'false',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.cacheKey).toBe('https://example.com/feed.xml\u00000');
    expect(parsed?.params.limit).toBe(3);
    expect(parsed?.params.allowPrivateNetwork).toBe(false);
  });

  it('blocks HTTP without allowPrivateNetwork and embedded URL credentials', async () => {
    const fetch = vi.fn();
    const ctx: WidgetSourceContext = { fetch, now: () => 1000 };

    const httpQuery = rssFeedSource.parseQuery({ url: 'http://example.com/feed.xml' })!;
    await expect(rssFeedSource.read(httpQuery.params, ctx)).rejects.toThrowError(
      SourcePolicyBlockedError,
    );

    const credsQuery = rssFeedSource.parseQuery({
      url: 'https://user:pass@example.com/feed.xml',
    })!;
    await expect(rssFeedSource.read(credsQuery.params, ctx)).rejects.toThrowError(
      SourcePolicyBlockedError,
    );

    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches via restricted context, parses newest-first, and projects by limit', async () => {
    const fetch = vi.fn(async () => ({ status: 200, body: SAMPLE_RSS }));
    const ctx: WidgetSourceContext = { fetch, now: () => 5000 };

    const parsed = rssFeedSource.parseQuery({
      url: 'http://10.0.0.5/feed.xml',
      limit: '1',
      allowPrivateNetwork: 'true',
    })!;
    const result = await rssFeedSource.read(parsed.params, ctx);

    expect(fetch).toHaveBeenCalledWith('http://10.0.0.5/feed.xml', {
      allowPrivate: true,
      timeoutMs: 8000,
      maxBodyBytes: MAX_FEED_BYTES,
      headers: {
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
      },
    });
    expect(result.feedTitle).toBe('Homelab Feed');
    expect(result.fetchedAt).toBe(5000);
    expect(result.stale).toBe(false);
    expect(result.entries.map((e) => e.title)).toEqual(['Second', 'First']);

    const projected = rssFeedSource.project!(result, parsed.params);
    expect(projected.entries.map((e) => e.title)).toEqual(['Second']);
  });

  it('throws SourceParseError on invalid XML and Error on non-2xx HTTP status', async () => {
    const badXmlCtx: WidgetSourceContext = {
      fetch: async () => ({ status: 200, body: '<html>not a feed</html>' }),
      now: () => 1000,
    };
    const q = rssFeedSource.parseQuery({ url: 'https://example.com/feed.xml' })!;
    await expect(rssFeedSource.read(q.params, badXmlCtx)).rejects.toThrowError(SourceParseError);

    const httpErrCtx: WidgetSourceContext = {
      fetch: async () => ({ status: 503, body: '' }),
      now: () => 1000,
    };
    await expect(rssFeedSource.read(q.params, httpErrCtx)).rejects.toThrowError('HTTP 503');
  });
});
