import { describe, expect, it, vi } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createTestAuth } from './test-auth.js';
import { createServiceConfiguration } from './service-configuration.js';
import { createObservationStore } from './service-observations.js';
import type { ServiceStatus } from './service-monitor.js';
import type { Service } from '@homora/shared';

// The real monitor would probe the fake URLs and overwrite the observations set up below.
vi.mock('./service-monitor.js', () => ({
  createServiceMonitor: () => ({
    run: async () => {},
    invalidate: async () => {},
    snapshot: () => ({}),
  }),
  startServiceMonitor: () => () => {},
}));

const SECRET_URL = 'https://secret-host.internal.example/admin-panel';
const SECRET_DESCRIPTION = 'private-description-marker';

async function setup() {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestAuth(database.db);
  const app = createApp(database.db, 5173, auth);
  const sqlite = getSqliteHandle(database.db);
  const headers = { origin: 'http://localhost:5173', cookie };
  const create = async (name: string, category = 'Media') =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name, url: SECRET_URL, category, description: SECRET_DESCRIPTION },
      })
    ).json<{ id: number }>().id;
  const configuration = createServiceConfiguration(sqlite);
  const store = createObservationStore(sqlite);
  const states: Record<number, ServiceStatus> = {};
  const observe = (id: number, status: ServiceStatus['status'], at = Date.now()) => {
    states[id] = {
      status,
      lastAttempt: new Date(at).toISOString(),
      reason: status === 'available' ? 'responding' : 'no-response',
      httpStatus: 200,
      latencyMs: 4242,
    };
    store.publish(configuration.listServices() as Service[], states);
  };
  const configure = (payload: object) =>
    app.inject({ method: 'PUT', url: '/api/public-status/admin', headers, payload });
  const share = (id: number, isPublic: boolean) =>
    app.inject({
      method: 'PUT',
      url: `/api/services/${id}/public`,
      headers,
      payload: { isPublic },
    });
  return { app, sqlite, headers, create, observe, configure, share, cookie };
}
const get = (app: Awaited<ReturnType<typeof setup>>['app']) =>
  app.inject({ method: 'GET', url: '/api/public/status' });

describe('public status', () => {
  it('is closed by default and hides that the feature exists', async () => {
    const { app, create, share } = await setup();
    const id = await create('Jellyfin');
    expect((await get(app)).statusCode).toBe(404);
    await share(id, true); // marked, but the page itself is still off
    const response = await get(app);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'not-found' });
    await app.close();
  });

  it('is 404 when enabled but nothing is shared', async () => {
    const { app, create, configure } = await setup();
    await create('Private');
    await configure({ enabled: true });
    expect((await get(app)).statusCode).toBe(404);
    await app.close();
  });

  it('shows only opted-in services, with no sensitive field anywhere', async () => {
    const { app, create, observe, configure, share, headers } = await setup();
    const shown = await create('Jellyfin', 'Media');
    const hidden = await create('Vaultwarden-hidden', 'Secrets');
    observe(shown, 'available');
    observe(hidden, 'available');
    await share(shown, true);
    await configure({ enabled: true, title: 'My lab' });
    const response = await get(app);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=15');
    const body = response.json<{
      title: string;
      services: Record<string, unknown>[];
    }>();
    expect(body.title).toBe('My lab');
    expect(body.services).toHaveLength(1);
    expect(body.services[0]).toMatchObject({ name: 'Jellyfin', category: 'Media', status: 'up' });
    expect(Object.keys(body.services[0]).sort()).toEqual(
      ['bars', 'category', 'checkedAt', 'name', 'status', 'uptime'].sort(),
    );
    const raw = response.body;
    for (const leak of [
      SECRET_URL,
      'secret-host',
      SECRET_DESCRIPTION,
      'Vaultwarden-hidden',
      'Secrets',
      '4242',
      'responding',
      'latency',
      '"id"',
    ])
      expect(raw).not.toContain(leak);
    // Private services never appear in the anonymous route nor in the authenticated list's public flag.
    const list = await app.inject({ method: 'GET', url: '/api/services', headers });
    expect(
      Object.fromEntries(
        list.json<{ id: number; isPublic: boolean }[]>().map((s) => [s.id, s.isPublic]),
      ),
    ).toEqual({ [shown]: true, [hidden]: false });
    await app.close();
  });

  it('shows an optional trimmed description, limits its length and audits the change', async () => {
    const { app, create, configure, share, headers } = await setup();
    await share(await create('Jellyfin'), true);
    expect((await configure({ enabled: true, description: `  Home services  ` })).statusCode).toBe(
      200,
    );
    expect((await get(app)).json<{ description: string }>().description).toBe('Home services');
    expect((await configure({ description: 'x'.repeat(161) })).statusCode).toBe(400);
    expect((await configure({ description: '' })).statusCode).toBe(200);
    expect((await get(app)).json<{ description: string }>().description).toBe('');
    const activity = await app.inject({ method: 'GET', url: '/api/activity', headers });
    const details = activity
      .json<{ events: { action: string; detail: string | null }[] }>()
      .events.filter((event) => event.action === 'public-status-update')
      .map((event) => event.detail);
    expect(details.filter((detail) => detail === 'description')).toHaveLength(2);
    await app.close();
  });

  it('reports coarse states and stale data as unknown', async () => {
    const { app, create, observe, configure, share } = await setup();
    const down = await create('Down');
    const stale = await create('Stale');
    observe(down, 'unavailable');
    observe(stale, 'available', Date.now() - 3_600_000);
    await share(down, true);
    await share(stale, true);
    await configure({ enabled: true });
    const states = Object.fromEntries(
      (await get(app))
        .json<{ services: { name: string; status: string }[] }>()
        .services.map((s) => [s.name, s.status]),
    );
    expect(states).toEqual({ Down: 'down', Stale: 'unknown' });
    await app.close();
  });

  it('answers 429 above the rate limit', async () => {
    const { app, create, configure, share } = await setup();
    await share(await create('A'), true);
    await configure({ enabled: true });
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) statuses.push((await get(app)).statusCode);
    expect(statuses.slice(0, 60).every((code) => code === 404 || code === 200)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
    await app.close();
  });

  it('does not open anything else under /api/public or other methods', async () => {
    const { app } = await setup();
    for (const url of [
      '/api/public/status/',
      '/api/public/other',
      '/api/public',
      '/api/public-status/admin',
    ])
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/public/status' })).statusCode).toBe(403);
    await app.close();
  });

  it('requires a session to change settings and audits each change', async () => {
    const { app, create, configure, share, headers } = await setup();
    const id = await create('A');
    const anonymous = { origin: 'http://localhost:5173' };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/public-status/admin',
          headers: anonymous,
          payload: { enabled: true },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/services/${id}/public`,
          headers: anonymous,
          payload: { isPublic: true },
        })
      ).statusCode,
    ).toBe(401);
    expect((await configure({ enabled: 'yes' })).statusCode).toBe(400);
    await configure({ enabled: true });
    await share(id, true);
    await share(id, true); // no change, no new event
    await configure({ enabled: false });
    const activity = await app.inject({ method: 'GET', url: '/api/activity', headers });
    const actions = activity
      .json<{ events: { action: string; detail: string | null }[] }>()
      .events.map((event) => `${event.action}:${event.detail}`);
    expect(actions.filter((a) => a.startsWith('public-status-update'))).toEqual([
      'public-status-update:disabled',
      'public-status-update:enabled',
    ]);
    expect(actions.filter((a) => a.startsWith('service-public'))).toEqual([
      `service-public:${id}:public`,
    ]);
    await app.close();
  });

  it('shows hourly bars and uptime from history', async () => {
    const { app, create, observe, configure, share } = await setup();
    const id = await create('A');
    const now = Date.now();
    observe(id, 'available', now - 2 * 3_600_000);
    observe(id, 'unavailable', now - 3_600_000);
    observe(id, 'available', now - 1000);
    await share(id, true);
    await configure({ enabled: true });
    const [service] = (await get(app)).json<{ services: { bars: string[]; uptime: number }[] }>()
      .services;
    expect(service.bars).toHaveLength(24);
    expect(service.bars.filter((bar) => bar === 'down')).toHaveLength(1);
    expect(service.bars.filter((bar) => bar === 'up').length).toBeGreaterThanOrEqual(2);
    expect(service.uptime).toBeCloseTo(66.7, 1);
    await app.close();
  });
});
