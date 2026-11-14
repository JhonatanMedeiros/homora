import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { createIntegrationConnections } from './integrations/integration-connections.js';
import * as networkRequest from './network-request.js';

const token = '1|coolify-SECRET456';
const resources = [
  {
    uuid: 'app-1',
    name: 'Blog',
    type: 'application',
    status: 'running:healthy',
    environment_id: 1,
  },
  { uuid: 'svc-1', name: 'Plausible', type: 'service', status: 'exited', environment_id: 1 },
  { uuid: 'db-1', name: 'Postgres', type: 'standalone-postgresql', status: 'running' },
];
const applications = [{ uuid: 'app-1', fqdn: 'https://blog.example.test' }];

afterEach(() => vi.restoreAllMocks());

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'homora-coolify-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const vault = createVault(path);
  return {
    database,
    vault,
    path,
    close() {
      database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const respond = (status: number, body: unknown, retryAfterSeconds?: number) => ({
  status,
  body: body === null ? '' : JSON.stringify(body),
  ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
});

it('serves resources, links cards to them and cascades on card and connection deletion', async () => {
  const f = setup();
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(f.database.db, 5173, auth, f.vault);
  const spy = vi
    .spyOn(networkRequest, 'getAuthorizedResponse')
    .mockImplementation(async (url) =>
      String(url).endsWith('/api/v1/applications')
        ? respond(200, applications)
        : respond(200, resources),
    );
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers,
      payload: {
        type: 'coolify',
        name: 'Coolify',
        url: 'https://coolify.example.test',
        secret: token,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain(token);
    const id = created.json().id as number;

    expect(
      (await app.inject({ method: 'GET', url: `/api/connections/${id}/resources` })).statusCode,
    ).toBe(401);
    const list = await app.inject({
      method: 'GET',
      url: `/api/connections/${id}/resources`,
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain(token);
    expect(list.json().data.resources.map((r: { uuid: string }) => r.uuid)).toEqual([
      'app-1',
      'svc-1',
    ]);
    expect(list.json().data.resources[0].urls).toEqual(['https://blog.example.test/']);
    // Bearer token goes only in the Authorization header of the request.
    expect(spy.mock.calls[0]![2]).toMatchObject({ headers: { authorization: `Bearer ${token}` } });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/connections/${id}/resources?refresh=x`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/connections/999/resources',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(404);
    const summary = await app.inject({
      method: 'GET',
      url: `/api/connections/${id}/data`,
      headers: { cookie },
    });
    expect(summary.json().data).toEqual({
      total: 2,
      running: 1,
      degraded: 0,
      stopped: 1,
      unknown: 0,
    });

    // /resources is for Coolify only, /guests for Proxmox only.
    const other = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers,
      payload: { type: 'jellyfin', name: 'J', url: 'https://jelly.example.test' },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/connections/${other.json().id}/resources`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/connections/${id}/guests`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);

    // Links.
    const card = (name: string) =>
      app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name, url: 'https://blog.example.test', category: 'Apps' },
      });
    const one = (await card('Blog')).json().id as number;
    const two = (await card('Other')).json().id as number;
    const link = {
      integrationId: id,
      resourceUuid: 'app-1',
      resourceType: 'application',
      name: 'Blog',
      url: 'https://blog.example.test/',
    };
    const put = (
      serviceId: number,
      payload: Record<string, unknown>,
      h: Record<string, string> = headers,
    ) =>
      app.inject({
        method: 'PUT',
        url: `/api/services/${serviceId}/resource-link`,
        headers: h,
        payload,
      });
    expect((await put(one, link, { origin: headers.origin })).statusCode).toBe(401);
    const saved = await put(one, link);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      serviceId: one,
      integrationId: id,
      resourceUuid: 'app-1',
      seenName: 'Blog',
    });
    expect(Object.keys(saved.json()).sort()).toEqual(
      [
        'id',
        'integrationId',
        'resourceType',
        'resourceUuid',
        'seenName',
        'seenUrl',
        'serviceId',
      ].sort(),
    );
    // Setting again acknowledges a reviewed change: one link per card.
    const renamed = await put(one, { ...link, name: 'Blog 2', url: null });
    expect(renamed.json()).toMatchObject({
      id: saved.json().id,
      seenName: 'Blog 2',
      seenUrl: null,
    });
    await put(two, {
      ...link,
      resourceUuid: 'svc-1',
      resourceType: 'service',
      name: 'Plausible',
      url: null,
    });
    const all = await app.inject({
      method: 'GET',
      url: '/api/resource-links',
      headers: { cookie },
    });
    expect(all.json()).toHaveLength(2);

    // Validation.
    for (const bad of [
      { ...link, resourceUuid: 'a b' },
      { ...link, resourceUuid: '../x' },
      { ...link, resourceType: 'database' },
      { ...link, name: '' },
      { ...link, name: 'x'.repeat(201) },
      { ...link, url: 'javascript:alert(1)' },
      { ...link, url: 'https://u:p@x.test' },
      { ...link, extra: true },
      { ...link, integrationId: 0 },
    ])
      expect((await put(one, bad)).statusCode).toBe(400);
    expect((await put(999, link)).json().code).toBe('service-not-found');
    expect((await put(one, { ...link, integrationId: 999 })).json().code).toBe(
      'integration-not-found',
    );
    expect((await put(one, { ...link, integrationId: other.json().id })).statusCode).toBe(400);

    // A card keeps working when its resource is gone; deleting a card removes its link.
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${two}`, headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/resource-links', headers: { cookie } })).json(),
    ).toHaveLength(1);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${one}/resource-link`, headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ method: 'DELETE', url: `/api/services/${one}/resource-link`, headers })
      ).json().code,
    ).toBe('resource-link-not-found');

    // Deleting the connection removes its links but never the cards.
    await put(one, link);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/connections/${id}`, headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/resource-links', headers: { cookie } })).json(),
    ).toEqual([]);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json(),
    ).toHaveLength(1);
  } finally {
    await app.close();
    f.close();
  }
});

async function coolify(f: ReturnType<typeof setup>, clock: () => number) {
  const connections = createIntegrationConnections(f.database.db, f.vault, clock);
  const created = await connections.createConnection({
    type: 'coolify',
    name: 'C',
    url: 'https://coolify.example.test',
    secret: token,
  });
  return { connections, id: created.id };
}

it('backs off after 401, 403 and 429 without touching the network, and recovers', async () => {
  const f = setup();
  let now = 1_000_000;
  const { connections, id } = await coolify(f, () => now);
  const spy = vi.spyOn(networkRequest, 'getAuthorizedResponse');
  try {
    spy.mockResolvedValue(respond(401, null));
    await expect(connections.connectionData(id)).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
    // Within 60 s neither the summary nor the inventory reaches the network.
    now += 59_000;
    await expect(connections.connectionData(id, true)).rejects.toThrow('temporarily unavailable');
    await expect(connections.resourcesData(id, true)).rejects.toThrow('temporarily unavailable');
    expect(spy).toHaveBeenCalledTimes(1);
    // After the window the next read goes out; a success clears the backoff.
    now += 2_000;
    spy.mockResolvedValue(respond(200, resources));
    await expect(connections.connectionData(id)).resolves.toMatchObject({ data: { total: 2 } });
    expect(spy).toHaveBeenCalledTimes(2);

    // 429 honours Retry-After (longer than the minimum), capped at 15 minutes.
    now += 31_000; // expire the 30 s cache
    spy.mockResolvedValue(respond(429, null, 300));
    await expect(connections.connectionData(id, true)).rejects.toThrow();
    const calls = spy.mock.calls.length;
    now += 299_000;
    await expect(connections.connectionData(id, true)).rejects.toThrow('temporarily unavailable');
    now += 2_000;
    spy.mockResolvedValue(respond(429, null, 3600));
    await expect(connections.connectionData(id, true)).rejects.toThrow();
    now += 899_000;
    await expect(connections.connectionData(id, true)).rejects.toThrow('temporarily unavailable');
    now += 2_000;
    spy.mockResolvedValue(respond(200, resources));
    await expect(connections.connectionData(id, true)).resolves.toBeDefined();
    expect(spy.mock.calls.length).toBe(calls + 2);
  } finally {
    f.close();
  }
});

it('lets the explicit test bypass a backoff, and editing the connection clears it', async () => {
  const f = setup();
  const now = 5_000_000;
  const { connections, id } = await coolify(f, () => now);
  const spy = vi.spyOn(networkRequest, 'getAuthorizedResponse');
  try {
    spy.mockResolvedValue(respond(403, null));
    await expect(connections.connectionData(id)).rejects.toThrow();
    await expect(connections.testConnection(id)).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(2);
    await expect(connections.connectionData(id, true)).rejects.toThrow('temporarily unavailable');
    // A new token: the update clears the backoff, the next read goes out.
    spy.mockResolvedValue(respond(200, resources));
    await connections.updateConnection(id, { secret: '2|new-token-777' });
    await expect(connections.connectionData(id, true)).resolves.toBeDefined();
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls[2]![2]).toMatchObject({
      headers: { authorization: 'Bearer 2|new-token-777' },
    });
    // A server error is never a reason to back off.
    spy.mockResolvedValue(respond(500, null));
    await expect(connections.connectionData(id, true)).rejects.toThrow();
    await expect(connections.connectionData(id, true)).rejects.toThrow();
    expect(spy).toHaveBeenCalledTimes(5);
  } finally {
    f.close();
  }
});

it('isolates a failing Coolify connection from the others', async () => {
  const f = setup();
  const { connections, id } = await coolify(f, () => 1);
  const second = await connections.createConnection({
    type: 'coolify',
    name: 'C2',
    url: 'https://other.example.test',
    secret: token,
  });
  const spy = vi
    .spyOn(networkRequest, 'getAuthorizedResponse')
    .mockImplementation(async (url) =>
      String(url).startsWith('https://coolify.') ? respond(401, null) : respond(200, resources),
    );
  try {
    await expect(connections.connectionData(id)).rejects.toThrow();
    await expect(connections.connectionData(second.id)).resolves.toMatchObject({
      data: { total: 2 },
    });
    expect(spy).toHaveBeenCalledTimes(2);
  } finally {
    f.close();
  }
});
