import { createServer } from 'node:http';
import Fastify from 'fastify';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { MAX_FEED_BYTES } from '@homora/widgets';
import { expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestSession } from '../test-auth.js';
import { registerWidgetFeedRoutes, type FeedFetcher } from './widget-feed.js';

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

it('requires an authenticated session on /api/widget-sources/feed', async () => {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);

  expect(
    (await app.inject('/api/widget-sources/feed?url=https://example.com/feed.xml')).statusCode,
  ).toBe(401);

  const missingUrl = await app.inject({
    url: '/api/widget-sources/feed',
    headers: { cookie, origin: 'http://localhost:5173' },
  });
  expect(missingUrl.statusCode).toBe(400);

  await app.close();
  getSqliteHandle(database.db).close();
});

it('enforces network policy for HTTP, embedded credentials, and disallowed destinations', async () => {
  const app = Fastify();
  const fetcher: FeedFetcher = vi.fn(async () => {
    throw Object.assign(new Error('Destination points to disallowed address.'), {
      code: 'destination-disallowed',
    });
  });
  registerWidgetFeedRoutes(app, fetcher);

  const httpBlocked = await app.inject(
    '/api/widget-sources/feed?url=http://example.com/feed.xml&allowPrivateNetwork=false',
  );
  expect(httpBlocked.statusCode).toBe(403);
  expect(httpBlocked.json()).toMatchObject({ code: 'policy-blocked', reason: 'https-required' });

  const credsBlocked = await app.inject(
    `/api/widget-sources/feed?url=${encodeURIComponent('https://user:pass@example.com/feed.xml')}`,
  );
  expect(credsBlocked.statusCode).toBe(403);
  expect(credsBlocked.json()).toMatchObject({
    code: 'policy-blocked',
    reason: 'credentials-not-allowed',
  });

  const privateBlocked = await app.inject(
    '/api/widget-sources/feed?url=https://192.168.1.10/feed.xml&allowPrivateNetwork=false',
  );
  expect(privateBlocked.statusCode).toBe(403);
  expect(privateBlocked.json()).toMatchObject({
    code: 'policy-blocked',
    reason: 'destination-disallowed',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);

  await app.close();
});

it('caches responses, deduplicates concurrent requests, and falls back to stale cache on refresh failure', async () => {
  let currentTime = 1_000_000;
  let calls = 0;
  let failNext = false;
  let resolveFetch: (() => void) | undefined;

  const fetcher: FeedFetcher = async (_dest, policy, options) => {
    expect(policy.allowPrivate).toBe(true);
    expect(options?.timeoutMs).toBe(8000);
    expect(options?.maxBodyBytes).toBe(MAX_FEED_BYTES);
    calls++;
    if (failNext) throw new Error('upstream down');
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        resolveFetch = resolve;
      });
    }
    return { status: 200, body: SAMPLE_RSS };
  };

  const app = Fastify();
  registerWidgetFeedRoutes(app, fetcher, () => currentTime);

  const p1 = app.inject(
    '/api/widget-sources/feed?url=http://10.0.0.5/feed.xml&limit=2&allowPrivateNetwork=true',
  );
  const p2 = app.inject(
    '/api/widget-sources/feed?url=http://10.0.0.5/feed.xml&limit=1&allowPrivateNetwork=true',
  );
  await new Promise((r) => setTimeout(r, 10));
  resolveFetch?.();
  const [r1, r2] = await Promise.all([p1, p2]);

  expect(calls).toBe(1);
  expect(r1.statusCode).toBe(200);
  expect(r1.json().entries).toHaveLength(2);
  expect(r1.json().entries[0].title).toBe('Second');
  expect(r1.json().stale).toBe(false);
  expect(r2.statusCode).toBe(200);
  expect(r2.json().entries).toHaveLength(1);

  // Within TTL: served from cache
  currentTime += 60_000;
  const cached = await app.inject(
    '/api/widget-sources/feed?url=http://10.0.0.5/feed.xml&limit=5&allowPrivateNetwork=true',
  );
  expect(calls).toBe(1);
  expect(cached.statusCode).toBe(200);
  expect(cached.json().stale).toBe(false);

  // Expired TTL + upstream failure: falls back to stale cache
  currentTime += 10 * 60_000;
  failNext = true;
  const staleRes = await app.inject(
    '/api/widget-sources/feed?url=http://10.0.0.5/feed.xml&limit=5&allowPrivateNetwork=true',
  );
  expect(calls).toBe(2);
  expect(staleRes.statusCode).toBe(200);
  expect(staleRes.json().stale).toBe(true);
  expect(staleRes.json().entries).toHaveLength(2);

  await app.close();
});

it('rejects redirects and loopback destinations when using the real restricted transport', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(302, { Location: 'https://example.com/other' });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  const app = Fastify();
  registerWidgetFeedRoutes(app);

  // Loopback is always blocked by network-policy.ts even with allowPrivateNetwork=true.
  const res = await app.inject(
    `/api/widget-sources/feed?url=${encodeURIComponent(`http://127.0.0.1:${port}/feed.xml`)}&allowPrivateNetwork=true`,
  );
  expect(res.statusCode).toBe(403);
  expect(res.json().code).toBe('policy-blocked');

  await app.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
