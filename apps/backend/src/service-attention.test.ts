import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createServiceAttention } from './service-attention.js';
import { createTestSession } from './test-auth.js';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

async function setup() {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);
  closers.push(async () => {
    await app.close();
    database.close();
  });
  const headers = { origin: 'http://localhost:5173', cookie };
  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  const created = await send('POST', '/api/services', {
    name: 'Plex',
    url: 'https://plex.example.com',
    category: 'Media',
    description: '',
  });
  const id = created.json<{ id: number }>().id;
  return { database, send, id };
}

describe('favorites', () => {
  it('pins and unpins a service and lists it as pinned', async () => {
    const { send, id } = await setup();
    expect((await send('GET', '/api/services')).json<{ pinned: boolean }[]>()[0]!.pinned).toBe(
      false,
    );
    expect((await send('PUT', `/api/services/${id}/pin`, { pinned: true })).json()).toEqual({
      pinned: true,
    });
    expect((await send('GET', '/api/services')).json<{ pinned: boolean }[]>()[0]!.pinned).toBe(
      true,
    );
    await send('PUT', `/api/services/${id}/pin`, { pinned: false });
    expect((await send('GET', '/api/services')).json<{ pinned: boolean }[]>()[0]!.pinned).toBe(
      false,
    );
  });

  it('refuses an unknown service and a malformed body', async () => {
    const { send, id } = await setup();
    expect((await send('PUT', '/api/services/999/pin', { pinned: true })).statusCode).toBe(404);
    expect((await send('PUT', `/api/services/${id}/pin`, { pinned: 'yes' })).statusCode).toBe(400);
    expect(
      (await send('PUT', `/api/services/${id}/pin`, { pinned: true, extra: 1 })).statusCode,
    ).toBe(400);
  });

  it('drops the pin with the service', async () => {
    const { send, id, database } = await setup();
    await send('PUT', `/api/services/${id}/pin`, { pinned: true });
    await send('DELETE', `/api/services/${id}`);
    const sqlite = getSqliteHandle(database.db);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM service_pins').get()).toEqual({ n: 0 });
  });
});

describe('favorites in export and import', () => {
  it('round-trips a pinned service and leaves others unpinned', async () => {
    const source = await setup();
    const other = (
      await source.send('POST', '/api/services', {
        name: 'Grafana',
        url: 'https://grafana.example.com',
        category: 'Media',
        description: '',
      })
    ).json<{ id: number }>();
    await source.send('PUT', `/api/services/${source.id}/pin`, { pinned: true });
    const exported = (await source.send('GET', '/api/config/export?format=json')).body;
    const services = (
      JSON.parse(exported) as { groups: { services: { name: string; pinned?: boolean }[] }[] }
    ).groups.flatMap((group) => group.services);
    expect(services.find((item) => item.name === 'Plex')?.pinned).toBe(true);
    expect(services.find((item) => item.name === 'Grafana')?.pinned).toBeUndefined();
    expect(other.id).toBeGreaterThan(0);

    const target = await setup();
    await target.send('DELETE', `/api/services/${target.id}`);
    expect(
      (await target.send('POST', '/api/config/import/apply', { content: exported })).statusCode,
    ).toBe(200);
    const imported = (await target.send('GET', '/api/services')).json<
      { name: string; pinned: boolean }[]
    >();
    expect(imported.find((item) => item.name === 'Plex')?.pinned).toBe(true);
    expect(imported.find((item) => item.name === 'Grafana')?.pinned).toBe(false);
  });

  it('reads files from before favorites existed', async () => {
    const { send, id } = await setup();
    await send('DELETE', `/api/services/${id}`);
    const content = JSON.stringify({
      version: 4,
      groups: [{ name: 'Home', services: [{ name: 'Old', url: 'https://old.example.com' }] }],
    });
    expect((await send('POST', '/api/config/import/apply', { content })).statusCode).toBe(200);
    expect((await send('GET', '/api/services')).json<{ pinned: boolean }[]>()[0]!.pinned).toBe(
      false,
    );
  });
});

describe('acknowledge and mute', () => {
  it('records an acknowledgement for an incident and clears it', async () => {
    const { send, id } = await setup();
    const state = (
      await send('PUT', `/api/services/${id}/acknowledgement`, { incidentId: 4 })
    ).json<{ incidentId: number; mutedUntil: number | null }>();
    expect(state.incidentId).toBe(4);
    expect(state.mutedUntil).toBeNull();
    expect((await send('GET', '/api/acknowledgements')).json()).toHaveProperty(String(id));
    expect((await send('DELETE', `/api/services/${id}/acknowledgement`)).statusCode).toBe(204);
    expect((await send('GET', '/api/acknowledgements')).json()).toEqual({});
  });

  it('mutes for a limited time and rejects out of range values', async () => {
    const { send, id } = await setup();
    const muted = (
      await send('PUT', `/api/services/${id}/acknowledgement`, { muteMinutes: 60 })
    ).json<{ mutedUntil: number; acknowledgedAt: number }>();
    expect(muted.mutedUntil - muted.acknowledgedAt).toBe(60 * 60_000);
    for (const muteMinutes of [0, -5, 10_081, 1.5])
      expect(
        (await send('PUT', `/api/services/${id}/acknowledgement`, { muteMinutes })).statusCode,
      ).toBe(400);
  });

  it('refuses an unknown service', async () => {
    const { send } = await setup();
    expect((await send('PUT', '/api/services/999/acknowledgement', {})).statusCode).toBe(404);
    expect((await send('DELETE', '/api/services/999/acknowledgement')).statusCode).toBe(404);
  });

  it('forgets a mute that has lapsed', async () => {
    const { database, id } = await setup();
    let now = 1_000_000;
    const attention = createServiceAttention(getSqliteHandle(database.db), () => now);
    attention.acknowledge(id, null, 5);
    expect(Object.keys(attention.list())).toEqual([String(id)]);
    now += 5 * 60_000 + 1;
    expect(attention.list()).toEqual({});
  });

  it('keeps an acknowledged incident until it is cleared, even without a mute', async () => {
    const { database, id } = await setup();
    let now = 1_000_000;
    const attention = createServiceAttention(getSqliteHandle(database.db), () => now);
    attention.acknowledge(id, 9);
    now += 7 * 24 * 3_600_000;
    expect(attention.list()[id]?.incidentId).toBe(9);
  });

  it('writes an audit entry', async () => {
    const { send, id, database } = await setup();
    await send('PUT', `/api/services/${id}/acknowledgement`, { muteMinutes: 30 });
    const rows = getSqliteHandle(database.db)
      .prepare("SELECT action, detail FROM audit_events WHERE action='service-acknowledge'")
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ detail: `service:${id} mute:30m` });
  });
});
