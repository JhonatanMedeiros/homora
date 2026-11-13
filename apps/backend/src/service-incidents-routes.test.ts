import { describe, expect, it, vi } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createTestSession } from './test-auth.js';

// The real monitor would probe the fake URL and race with the rows set up below.
vi.mock('./service-monitor.js', () => ({
  createServiceMonitor: () => ({
    run: async () => {},
    invalidate: async () => {},
    snapshot: () => ({}),
  }),
  startServiceMonitor: () => () => {},
}));

async function setup() {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);
  const sqlite = getSqliteHandle(database.db);
  const headers = { origin: 'http://localhost:5173', cookie };
  const id = (
    await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'Portainer', url: 'https://portainer.example.com', category: 'Infra' },
    })
  ).json<{ id: number }>().id;
  return { app, sqlite, headers, id };
}
const settings = { failureThreshold: 3, recoveryThreshold: 2, degradedLatencyMs: 800 };

describe('incident routes', () => {
  it('requires a session', async () => {
    const { app, id } = await setup();
    for (const url of ['/api/status-overview', `/api/services/${id}/incidents`])
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/services/${id}/monitoring`,
          headers: { origin: 'http://localhost:5173' },
          payload: settings,
        })
      ).statusCode,
    ).toBe(401);
    await app.close();
  });

  it('saves settings, shows them in the overview and audits the change', async () => {
    const { app, sqlite, headers, id } = await setup();
    const put = (payload: unknown) =>
      app.inject({
        method: 'PUT',
        url: `/api/services/${id}/monitoring`,
        headers,
        payload: payload as object,
      });
    expect((await put(settings)).json()).toEqual(settings);
    const overview = (
      await app.inject({ method: 'GET', url: '/api/status-overview', headers })
    ).json();
    expect(overview.settings[id]).toEqual(settings);
    expect(overview).toMatchObject({ incidents7d: 0, mttrMs: null, sla: { targetPct: 99.9 } });
    expect(
      sqlite
        .prepare("SELECT detail FROM audit_events WHERE action='service-monitoring-update'")
        .all(),
    ).toEqual([{ detail: `${id}:3/2/800` }]);
    // Saving the same values again is not a new audit event, and defaults clear the row.
    await put(settings);
    await put({ failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: null });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM service_monitor_settings').get()).toEqual({
      n: 0,
    });
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='service-monitoring-update'")
        .get(),
    ).toEqual({ n: 2 });
    await app.close();
  });

  it('rejects malformed settings and unknown services', async () => {
    const { app, headers, id } = await setup();
    const put = (url: string, payload: unknown) =>
      app.inject({ method: 'PUT', url, headers, payload: payload as object });
    const url = `/api/services/${id}/monitoring`;
    for (const bad of [
      { ...settings, failureThreshold: 0 },
      { ...settings, recoveryThreshold: 11 },
      { ...settings, degradedLatencyMs: 10 },
      { ...settings, degradedLatencyMs: 1.5 },
      { ...settings, extra: true },
      { failureThreshold: 3 },
    ])
      expect((await put(url, bad)).statusCode).toBe(400);
    expect((await put('/api/services/9999/monitoring', settings)).statusCode).toBe(404);
    expect((await put('/api/services/abc/monitoring', settings)).statusCode).toBe(404);
    await app.close();
  });

  it('lists a service’s incidents newest first with paging', async () => {
    const { app, sqlite, headers, id } = await setup();
    const insert = sqlite.prepare(
      'INSERT INTO service_incidents(service_id,started_at,ended_at,reason,http_status,failed_checks) VALUES(?,?,?,?,?,?)',
    );
    for (let i = 0; i < 3; i++)
      insert.run(id, 1_000 * (i + 1), 1_000 * (i + 1) + 500, 'error-status', 502, 3);
    insert.run(id, 9_000, null, 'no-response', null, 1);
    const list = async (query = '') =>
      (
        await app.inject({ method: 'GET', url: `/api/services/${id}/incidents${query}`, headers })
      ).json();
    const first = await list('?limit=2');
    expect(first.incidents.map((i: { startedAt: number }) => i.startedAt)).toEqual([9_000, 3_000]);
    expect(first.incidents[0]).toMatchObject({
      endedAt: null,
      reason: 'no-response',
      httpStatus: null,
    });
    const next = await list(`?limit=2&before=${first.nextBefore}`);
    expect(next.incidents.map((i: { startedAt: number }) => i.startedAt)).toEqual([2_000, 1_000]);
    expect(next.nextBefore).toBeNull();
    expect(
      (await app.inject({ method: 'GET', url: `/api/services/${id}/incidents?limit=0`, headers }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services/9999/incidents', headers }))
        .statusCode,
    ).toBe(404);
    await app.close();
  });

  it('removes incidents and settings with the service', async () => {
    const { app, sqlite, headers, id } = await setup();
    await app.inject({
      method: 'PUT',
      url: `/api/services/${id}/monitoring`,
      headers,
      payload: settings,
    });
    sqlite
      .prepare(
        "INSERT INTO service_incidents(service_id,started_at,reason) VALUES(?,1,'no-response')",
      )
      .run(id);
    await app.inject({ method: 'DELETE', url: `/api/services/${id}`, headers });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM service_incidents').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM service_monitor_settings').get()).toEqual({
      n: 0,
    });
    await app.close();
  });
});
