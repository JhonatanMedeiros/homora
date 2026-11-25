import { createServer } from 'node:http';
import Fastify from 'fastify';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { SourcePolicyBlockedError, type WidgetSourceReader } from '@homora/widgets';
import { expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { createTestSession } from '../test-auth.js';
import { registerWidgetSourceRoutes, type SourceFetcher } from './widget-sources.js';

type SampleParams = { url: string; limit: number; allowPrivate: boolean };
type SampleResult = { items: string[]; fetchedAt: number; stale: boolean };

function createSyntheticSource(): WidgetSourceReader<SampleParams, SampleResult> {
  return {
    contract: 'sample-source',
    cacheTtlMs: 5 * 60_000,
    maxCacheEntries: 16,
    parseQuery: (query) => {
      if (!query.url) return null;
      const limit = query.limit ? Number(query.limit) : 5;
      if (!Number.isInteger(limit) || limit < 1) return null;
      const allowPrivate = query.allowPrivate === 'true';
      return {
        cacheKey: `${query.url}\0${allowPrivate ? '1' : '0'}`,
        params: { url: query.url, limit, allowPrivate },
      };
    },
    read: async (params, ctx) => {
      const res = await ctx.fetch(params.url, {
        allowPrivate: params.allowPrivate,
        timeoutMs: 99_999, // host must clamp to 8000
        maxBodyBytes: 9_999_999, // host must clamp to 512 KB
      });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return {
        items: res.body.split(','),
        fetchedAt: ctx.now(),
        stale: false,
      };
    },
    project: (cached, params) => ({
      ...cached,
      items: cached.items.slice(0, params.limit),
    }),
  };
}

it('requires an authenticated session and validates contract & query on /api/widget-sources/:contract', async () => {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);

  expect(
    (await app.inject('/api/widget-sources/feed?url=https://example.com/feed.xml')).statusCode,
  ).toBe(401);

  const invalidQuery = await app.inject({
    url: '/api/widget-sources/feed',
    headers: { cookie, origin: 'http://localhost:5173' },
  });
  expect(invalidQuery.statusCode).toBe(400);

  const unknownContract = await app.inject({
    url: '/api/widget-sources/does-not-exist',
    headers: { cookie, origin: 'http://localhost:5173' },
  });
  expect(unknownContract.statusCode).toBe(404);

  await app.close();
  getSqliteHandle(database.db).close();
});

it('caches, deduplicates concurrent requests, clamps limits, and falls back to stale cache', async () => {
  let currentTime = 1_000_000;
  let calls = 0;
  let failNext = false;
  let resolveFetch: (() => void) | undefined;

  const fetcher: SourceFetcher = async (_dest, policy, options) => {
    expect(policy.allowPrivate).toBe(true);
    expect(options?.timeoutMs).toBe(8000);
    expect(options?.maxBodyBytes).toBe(512 * 1024);
    calls++;
    if (failNext) throw new Error('upstream down');
    if (calls === 1) {
      await new Promise<void>((resolve) => {
        resolveFetch = resolve;
      });
    }
    return { status: 200, body: 'a,b,c' };
  };

  const sample = createSyntheticSource();
  const app = Fastify();
  registerWidgetSourceRoutes(
    app,
    fetcher,
    () => currentTime,
    (contract) => (contract === sample.contract ? sample : undefined),
  );

  const p1 = app.inject(
    '/api/widget-sources/sample-source?url=http://10.0.0.5/data&limit=2&allowPrivate=true',
  );
  const p2 = app.inject(
    '/api/widget-sources/sample-source?url=http://10.0.0.5/data&limit=1&allowPrivate=true',
  );
  await new Promise((r) => setTimeout(r, 10));
  resolveFetch?.();
  const [r1, r2] = await Promise.all([p1, p2]);

  expect(calls).toBe(1);
  expect(r1.statusCode).toBe(200);
  expect(r1.json()).toEqual({ items: ['a', 'b'], fetchedAt: 1_000_000, stale: false });
  expect(r2.statusCode).toBe(200);
  expect(r2.json()).toEqual({ items: ['a'], fetchedAt: 1_000_000, stale: false });

  currentTime += 60_000;
  const cached = await app.inject(
    '/api/widget-sources/sample-source?url=http://10.0.0.5/data&limit=3&allowPrivate=true',
  );
  expect(calls).toBe(1);
  expect(cached.statusCode).toBe(200);
  expect(cached.json().items).toEqual(['a', 'b', 'c']);

  currentTime += 10 * 60_000;
  failNext = true;
  const staleRes = await app.inject(
    '/api/widget-sources/sample-source?url=http://10.0.0.5/data&limit=2&allowPrivate=true',
  );
  expect(calls).toBe(2);
  expect(staleRes.statusCode).toBe(200);
  expect(staleRes.json()).toEqual({ items: ['a', 'b'], fetchedAt: 1_000_000, stale: true });

  await app.close();
});

it('invalidates integration-tagged cache and blocks stale fallback after invalidation', async () => {
  let fail = false;
  let calls = 0;
  const reader: WidgetSourceReader<{ connectionId: number }, SampleResult> = {
    contract: 'integration-cache-test',
    cacheTtlMs: 60_000,
    parseQuery: (query) => {
      const connectionId = Number(query.connectionId);
      if (!Number.isSafeInteger(connectionId) || connectionId < 1) return null;
      return {
        cacheKey: String(connectionId),
        cacheTags: [`integration:${connectionId}`],
        params: { connectionId },
      };
    },
    read: async (_params, context) => {
      calls++;
      if (fail) throw new Error('connection changed');
      return { items: ['current'], fetchedAt: context.now(), stale: false };
    },
  };
  const app = Fastify();
  const cache = registerWidgetSourceRoutes(
    app,
    undefined,
    () => 1_000,
    (contract) => (contract === reader.contract ? reader : undefined),
  );
  const path = '/api/widget-sources/integration-cache-test?connectionId=12';

  expect((await app.inject(path)).json()).toMatchObject({ items: ['current'], stale: false });
  cache.invalidateIntegration(12);
  fail = true;
  const failed = await app.inject(path);
  expect(failed.statusCode).toBe(502);
  expect(failed.json()).toMatchObject({ code: 'feed-fetch-failed' });
  expect(calls).toBe(2);

  await app.close();
});

it('does not cache or return an in-flight integration read after invalidation', async () => {
  let releaseFirstRead: (() => void) | undefined;
  let calls = 0;
  const reader: WidgetSourceReader<{ connectionId: number }, SampleResult> = {
    contract: 'integration-inflight-test',
    cacheTtlMs: 60_000,
    parseQuery: (query) => {
      const connectionId = Number(query.connectionId);
      if (!Number.isSafeInteger(connectionId) || connectionId < 1) return null;
      return {
        cacheKey: String(connectionId),
        cacheTags: [`integration:${connectionId}`],
        params: { connectionId },
      };
    },
    read: async (_params, context) => {
      calls++;
      if (calls === 1)
        await new Promise<void>((resolve) => {
          releaseFirstRead = resolve;
        });
      return { items: [`reading-${calls}`], fetchedAt: context.now(), stale: false };
    },
  };
  const app = Fastify();
  const cache = registerWidgetSourceRoutes(
    app,
    undefined,
    () => 1_000,
    (contract) => (contract === reader.contract ? reader : undefined),
  );
  const path = '/api/widget-sources/integration-inflight-test?connectionId=19';

  const first = app.inject(path);
  await new Promise((resolve) => setTimeout(resolve, 0));
  cache.invalidateIntegration(19);
  releaseFirstRead?.();
  const invalidated = await first;
  expect(invalidated.statusCode).toBe(502);

  const current = await app.inject(path);
  expect(current.statusCode).toBe(200);
  expect(current.json()).toMatchObject({ items: ['reading-2'], stale: false });
  expect(calls).toBe(2);
  await app.close();
});

it('maps policy-blocked errors to 403 without serving stale cache and enforces real network-policy', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(302, { Location: 'https://example.com/other' });
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  const sample = createSyntheticSource();
  const app = Fastify();
  registerWidgetSourceRoutes(app, undefined, Date.now, (contract) =>
    contract === sample.contract ? sample : undefined,
  );

  // Loopback is always blocked by network-policy.ts even with allowPrivate=true.
  const res = await app.inject(
    `/api/widget-sources/sample-source?url=${encodeURIComponent(`http://127.0.0.1:${port}/data`)}&allowPrivate=true`,
  );
  expect(res.statusCode).toBe(403);
  expect(res.json().code).toBe('policy-blocked');

  // Reader-thrown SourcePolicyBlockedError also returns 403.
  const blockingReader: WidgetSourceReader<unknown, unknown> = {
    contract: 'policy-test',
    parseQuery: () => ({ cacheKey: 'k', params: {} }),
    read: vi.fn(async () => {
      throw new SourcePolicyBlockedError('https-required');
    }),
  };
  const app2 = Fastify();
  registerWidgetSourceRoutes(app2, undefined, Date.now, (c) =>
    c === 'policy-test' ? blockingReader : undefined,
  );
  const blocked = await app2.inject('/api/widget-sources/policy-test');
  expect(blocked.statusCode).toBe(403);
  expect(blocked.json()).toMatchObject({ code: 'policy-blocked', reason: 'https-required' });

  await app.close();
  await app2.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
