import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CoolifyBackoffError,
  createCoolifyAdapter,
  normalizeCoolifyState,
  parseCoolifyUrls,
} from './coolify-connection.js';
import type { FakeRequest, FakeResponse } from './adapter-contract.js';

const read = (name: string) =>
  (
    JSON.parse(
      readFileSync(new URL(`./fixtures/coolify/${name}.json`, import.meta.url), 'utf8'),
    ) as {
      body: unknown;
    }
  ).body;
const token = '1|coolify-SECRET456';
const config = { url: 'https://coolify.example.test', secret: token };

function routed(
  routes: Record<string, (FakeResponse & { retryAfterSeconds?: number }) | (() => never)>,
) {
  const requests: FakeRequest[] = [];
  const transport = vi.fn(async (request: FakeRequest) => {
    requests.push(request);
    const route = routes[request.path];
    if (!route) return { status: 404, body: null };
    return typeof route === 'function' ? route() : route;
  });
  return { requests, adapter: createCoolifyAdapter(transport) };
}

describe('Coolify status normalization', () => {
  it('maps the composite status and never invents offline', () => {
    expect(normalizeCoolifyState('running:healthy')).toBe('running');
    expect(normalizeCoolifyState('running')).toBe('running');
    expect(normalizeCoolifyState('running:unknown')).toBe('running');
    expect(normalizeCoolifyState('Running:Unhealthy')).toBe('degraded');
    expect(normalizeCoolifyState('degraded:unhealthy')).toBe('degraded');
    expect(normalizeCoolifyState('exited:unhealthy')).toBe('stopped');
    expect(normalizeCoolifyState('stopped')).toBe('stopped');
    for (const value of ['restarting', '', 'offline', undefined, null, 5, {}])
      expect(normalizeCoolifyState(value)).toBe('unknown');
  });
});

describe('Coolify addresses', () => {
  it('splits, trims, dedupes, keeps http(s) without credentials, at most five', () => {
    expect(
      parseCoolifyUrls(
        'https://a.test, https://a.test,http://b.test:8080/x,ftp://c.test,javascript:alert(1),https://u:p@d.test,nope',
      ),
    ).toEqual(['https://a.test/', 'http://b.test:8080/x']);
    expect(
      parseCoolifyUrls(Array.from({ length: 9 }, (_, i) => `https://h${i}.test`).join(',')),
    ).toHaveLength(5);
    for (const value of [null, undefined, 5, '', 'x'.repeat(5000)])
      expect(parseCoolifyUrls(value)).toEqual([]);
  });
});

describe('Coolify adapter', () => {
  it('reads only resources for the summary, with a bearer token and a bounded body', async () => {
    const { adapter, requests } = routed({
      '/api/v1/resources': { status: 200, body: read('resources') },
    });
    await expect(adapter.collect(config)).resolves.toEqual({
      total: 4,
      running: 1,
      degraded: 1,
      stopped: 1,
      unknown: 1,
    });
    expect(requests).toEqual([
      {
        origin: 'https://coolify.example.test',
        path: '/api/v1/resources',
        authorization: `Bearer ${token}`,
        maxBodyBytes: 2_000_000,
      },
    ]);
  });

  it('builds the inventory with explicit fields only and ignores databases', async () => {
    const { adapter, requests } = routed({
      '/api/v1/resources': { status: 200, body: read('resources') },
      '/api/v1/applications': { status: 200, body: read('applications') },
    });
    const { resources } = await adapter.inventory(config);
    expect(resources.map(({ uuid }) => uuid)).toEqual([
      'app-uuid-1',
      'svc-uuid-2',
      'app-uuid-3',
      'app-uuid-4',
    ]);
    expect(resources[0]).toEqual({
      uuid: 'app-uuid-1',
      type: 'application',
      name: 'Blog',
      description: 'Personal blog',
      state: 'running',
      rawStatus: 'running:healthy',
      urls: ['https://blog.example.test/', 'https://www.blog.example.test/'],
      environmentId: 1,
    });
    expect(resources[1]).toMatchObject({
      type: 'service',
      description: null,
      state: 'degraded',
      urls: [],
    });
    expect(resources[2]).toMatchObject({ state: 'stopped', urls: [] });
    expect(resources[3]).toMatchObject({ state: 'unknown', rawStatus: 'restarting', urls: [] });
    expect(JSON.stringify(resources)).not.toContain('do-not-copy');
    // Never the detail endpoint of a service (it carries compose content) and never a team endpoint.
    expect(requests.map(({ path }) => path)).toEqual(['/api/v1/resources', '/api/v1/applications']);
  });

  it('keeps the inventory when the applications read fails or is oversized', async () => {
    for (const second of [
      { status: 403, body: null },
      { status: 429, body: null, retryAfterSeconds: 30 },
      { status: 500, body: null },
      { status: 200, body: { not: 'an array' } },
      (() => {
        throw new Error('Response exceeded limit.');
      }) as () => never,
    ]) {
      const { adapter } = routed({
        '/api/v1/resources': { status: 200, body: read('resources') },
        '/api/v1/applications': second,
      });
      const { resources } = await adapter.inventory(config);
      expect(resources).toHaveLength(4);
      expect(resources.every(({ urls }) => urls.length === 0)).toBe(true);
    }
  });

  it('skips the applications read when there is no application', async () => {
    const { adapter, requests } = routed({
      '/api/v1/resources': { status: 200, body: [{ uuid: 's', name: 'S', type: 'service' }] },
    });
    await adapter.inventory(config);
    expect(requests).toHaveLength(1);
  });

  it('rejects a credential reflected in an address', async () => {
    const { adapter } = routed({
      '/api/v1/resources': { status: 200, body: read('resources') },
      '/api/v1/applications': {
        status: 200,
        body: [{ uuid: 'app-uuid-1', fqdn: `https://x.test/${token}` }],
      },
    });
    await expect(adapter.inventory(config)).rejects.toThrow('Invalid response');
  });

  it('keeps a configured path prefix in front of the API path', async () => {
    const { adapter, requests } = routed({
      '/coolify/api/v1/resources': { status: 200, body: [] },
    });
    await adapter.collect({ url: 'https://example.test/coolify/', secret: token });
    expect(requests[0]).toMatchObject({
      origin: 'https://example.test',
      path: '/coolify/api/v1/resources',
    });
  });

  it('reports auth failures and rate limits as typed errors with fixed messages', async () => {
    for (const status of [401, 403]) {
      const { adapter } = routed({ '/api/v1/resources': { status, body: { message: token } } });
      const error = await adapter.collect(config).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CoolifyBackoffError);
      expect((error as CoolifyBackoffError).kind).toBe('auth');
      expect((error as Error).message).not.toContain(token);
    }
    const { adapter } = routed({
      '/api/v1/resources': { status: 429, body: null, retryAfterSeconds: 42 },
    });
    const error = (await adapter.collect(config).catch((e: unknown) => e)) as CoolifyBackoffError;
    expect(error).toBeInstanceOf(CoolifyBackoffError);
    expect(error).toMatchObject({ kind: 'rate-limited', retryAfterSeconds: 42 });
    // A server error is not a reason to back off.
    const failing = routed({ '/api/v1/resources': { status: 500, body: null } });
    expect(await failing.adapter.collect(config).catch((e: unknown) => e)).not.toBeInstanceOf(
      CoolifyBackoffError,
    );
  });

  it('never calls the network for an invalid config', async () => {
    const transport = vi.fn();
    const adapter = createCoolifyAdapter(transport);
    await expect(adapter.inventory({ url: 'http://x.test', secret: token })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
