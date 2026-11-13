import { integrationDefinitions } from '@homora/shared';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createAppTestContext } from './app-test-context.js';
const context = await createAppTestContext();
const { app, cookie } = context;
afterAll(context.close);
afterEach(context.clean);
describe('Services API', () => {
  it.each([0, 1, 2])('renumbers groups after deleting index %i', async (deletedIndex) => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const groups: { id: number; name: string }[] = [];
    for (const name of ['First', 'Middle', 'Last']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/groups',
        headers,
        payload: { name },
      });
      groups.push(response.json());
    }
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/groups/${groups[deletedIndex].id}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    const remaining = groups.filter((_, index) => index !== deletedIndex);
    const list = async () =>
      (await app.inject({ method: 'GET', url: '/api/groups', headers })).json();
    expect(await list()).toMatchObject(
      remaining.map((group, position) => ({ ...group, position })),
    );
    const created = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers,
      payload: { name: 'New' },
    });
    expect(created.json().position).toBe(2);
    const names = ['New', ...remaining.map((group) => group.name)];
    expect(
      (await app.inject({ method: 'PUT', url: '/api/groups/order', headers, payload: { names } }))
        .statusCode,
    ).toBe(200);
    expect(await list()).toMatchObject(names.map((name, position) => ({ name, position })));
  });
  it('persists icons by name and URL and discards invalid values', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const create = async (icon: string) =>
      app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name: 'Icon', url: 'http://localhost:8096', category: 'Media', icon },
      });
    const stored = async () =>
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json() as {
        icon: string;
      }[];
    expect((await create('lucide:film')).statusCode).toBe(201);
    expect((await create('https://example.test/film.svg')).statusCode).toBe(201);
    expect((await create('https://user:pass@example.test/a.png')).statusCode).toBe(201);
    expect((await stored()).map((service) => service.icon).sort()).toEqual([
      '',
      'https://example.test/film.svg',
      'lucide:film',
    ]);
    expect((await create('x'.repeat(513))).statusCode).toBe(400);
  });
  it('protects integration catalog and returns metadata only', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/integrations/catalog' })).statusCode).toBe(
      401,
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/integrations/catalog',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const catalog = response.json() as {
      type: string;
      label: string;
      capabilities: string[];
      fields: { key: string }[];
    }[];
    expect(catalog.map(({ type, label, capabilities }) => ({ type, label, capabilities }))).toEqual(
      integrationDefinitions.map(({ type, label, capabilities }) => ({
        type,
        label,
        capabilities: [...capabilities],
      })),
    );
    expect(catalog.at(-1)?.type).toBe('proxmox');
    // Field descriptions only: no stored values, requests or extraction rules.
    expect(
      catalog.find(({ type }) => type === 'home-assistant')!.fields.map((field) => field.key),
    ).toEqual(['url', 'entityId', 'secret']);
    expect(JSON.stringify(catalog)).not.toContain('/api/states');
  });
  it('does not expose services without an active session', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/services' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/service-status' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services/1/status-detail' })).statusCode,
    ).toBe(401);
    for (const url of ['/api/services/uptime', '/api/services/1/uptime'])
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
  });
  it('serves uptime in batch and per service, and rejects unknown ranges and services', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const id = (
      await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name: 'Uptime', url: 'http://localhost:8098', category: 'Teste' },
      })
    ).json().id;
    const batch = await app.inject({
      method: 'GET',
      url: '/api/services/uptime',
      headers: { cookie },
    });
    expect(batch.statusCode).toBe(200);
    expect(batch.json()[id]).toMatchObject({ range: '24h', uptimePct: null });
    expect(batch.json()[id].checks).toBeGreaterThanOrEqual(0);
    expect(batch.json()[id].buckets).toHaveLength(48);
    const single = await app.inject({
      method: 'GET',
      url: `/api/services/${id}/uptime?range=7d`,
      headers: { cookie },
    });
    expect(single.json()).toMatchObject({ range: '7d', p95LatencyMs: null });
    for (const url of ['/api/services/uptime?range=1y', `/api/services/${id}/uptime?range=x`])
      expect((await app.inject({ method: 'GET', url, headers: { cookie } })).statusCode).toBe(400);
    for (const url of ['/api/services/999999/uptime', '/api/services/abc/uptime'])
      expect((await app.inject({ method: 'GET', url, headers: { cookie } })).statusCode).toBe(404);
    await app.inject({ method: 'DELETE', url: `/api/services/${id}`, headers });
  });
  it('serves failure details only for existing services', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const created = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'Detalhe', url: 'http://localhost:8097', category: 'Teste' },
    });
    const id = created.json().id;
    const found = await app.inject({
      method: 'GET',
      url: `/api/services/${id}/status-detail`,
      headers: { cookie },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ recent: expect.any(Array), lastSuccess: null });
    for (const url of ['/api/services/999999/status-detail', '/api/services/abc/status-detail']) {
      const missing = await app.inject({ method: 'GET', url, headers: { cookie } });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('service-not-found');
    }
    await app.inject({ method: 'DELETE', url: `/api/services/${id}`, headers });
  });
  it('creates, lists, updates, and deletes services', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const created = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'Jellyfin', url: 'http://localhost:8096', category: 'Mídia' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect(created.json().allowPrivate).toBe(false);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json(),
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/services/${id}`,
          headers,
          payload: {
            name: 'Novo',
            url: 'http://localhost:8096',
            category: 'Mídia',
            allowPrivate: true,
          },
        })
      ).json(),
    ).toMatchObject({ name: 'Novo', allowPrivate: true });
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json()[0],
    ).toMatchObject({ id, name: 'Novo', allowPrivate: true });
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${id}`, headers })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json(),
    ).toEqual([]);
  });
  it('manages empty groups and preserves cards when renaming', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const createdGroup = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers,
      payload: { name: 'Panel' },
    });
    expect(createdGroup.statusCode).toBe(201);
    const groupId = createdGroup.json().id;
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers,
      payload: { name: 'Panel' },
    });
    expect(duplicate.statusCode).toBe(409);
    const service = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'App', url: 'http://localhost:8100', category: 'Panel' },
    });
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/groups/${groupId}`, headers })).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/groups/${groupId}`,
          headers,
          payload: { name: 'Dashboard' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json()[0]
        .category,
    ).toBe('Dashboard');
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/services/${service.json().id}`, headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/groups/${groupId}`, headers })).statusCode,
    ).toBe(200);
  });
  it('validates and persists ordering of empty groups', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    await app.inject({
      method: 'POST',
      url: '/api/groups',
      headers,
      payload: { name: 'Living Room' },
    });
    await app.inject({ method: 'POST', url: '/api/groups', headers, payload: { name: 'Bedroom' } });
    const groups = (
      await app.inject({ method: 'GET', url: '/api/groups', headers: { cookie } })
    ).json() as { name: string }[];
    const reversed = groups.map((group) => group.name).reverse();
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/groups/order',
          headers,
          payload: { names: reversed },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        (await app.inject({ method: 'GET', url: '/api/groups', headers: { cookie } })).json() as {
          name: string;
        }[]
      ).map((group) => group.name),
    ).toEqual(reversed);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/groups/order',
          headers,
          payload: { names: ['missing'] },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('validates and persists individual card ordering', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const ids: number[] = [];
    for (const name of ['First', 'Second', 'Third']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name, url: `http://localhost:${8100 + ids.length}`, category: 'Order' },
      });
      ids.push(response.json().id);
    }
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/services/order',
          headers,
          payload: { category: 'Order', ids: [ids[2], ids[0], ids[1]] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
        .json()
        .filter((service: { category: string }) => service.category === 'Order')
        .map((service: { id: number }) => service.id),
    ).toEqual([ids[2], ids[0], ids[1]]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/services/order',
          headers,
          payload: { category: 'Order', ids: [ids[0]] },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('rejects bodies and parameters that do not match HTTP contracts', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const invalidRequests = [
      {
        method: 'POST',
        url: '/api/services',
        payload: { name: 42, url: 'https://example.test', category: 'Home' },
      },
      {
        method: 'POST',
        url: '/api/services',
        payload: { name: 'Home', url: 'https://example.test', category: 'Home', admin: true },
      },
      { method: 'POST', url: '/api/groups', payload: { name: 42 } },
      { method: 'PUT', url: '/api/groups/order', payload: { names: ['Home', 42] } },
      { method: 'PUT', url: '/api/services/order', payload: { category: 'Home', ids: ['1'] } },
      {
        method: 'POST',
        url: '/api/agents',
        payload: { name: 'Agent', scopes: ['admin'] },
      },
      {
        method: 'POST',
        url: '/api/connections',
        payload: { type: 'jellyfin', name: 'Media', url: 'https://media.example', admin: true },
      },
    ] as const;
    for (const { method, url, payload } of invalidRequests) {
      expect(
        (await app.inject({ method, url, headers, payload })).statusCode,
        `${method} ${url}`,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: '/api/services/9007199254740992',
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });
  it('appends cards after the highest position even when gaps exist', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const ids: number[] = [];
    for (const name of ['A', 'B', 'C']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name, url: `http://localhost:${8200 + ids.length}`, category: 'Gaps' },
      });
      ids.push(response.json().id);
    }
    await app.inject({ method: 'DELETE', url: `/api/services/${ids[1]}`, headers });
    const added = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'D', url: 'http://localhost:8203', category: 'Gaps' },
    });
    expect(added.json().position).toBe(3);
    expect(
      (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
        .json()
        .filter((service: { category: string }) => service.category === 'Gaps')
        .map((service: { name: string }) => service.name),
    ).toEqual(['A', 'C', 'D']);
  });
  it('blocks external origins and invalid data', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/services',
          headers: { origin: 'http://malicious.test' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/services',
          headers: { origin: 'http://localhost:5173', cookie },
          payload: { name: 'Test', category: 'Home', url: 'javascript:alert(1)' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('requires exact origin match on every mutation', async () => {
    const headers = { cookie, origin: 'http://localhost:51730' };
    for (const [method, url] of [
      ['POST', '/api/services'],
      ['POST', '/api/auth/sign-out'],
      ['POST', '/api/connections'],
      ['POST', '/api/widgets'],
    ] as const) {
      expect((await app.inject({ method, url, headers, payload: {} })).statusCode).toBe(403);
    }
    expect(
      (await app.inject({ method: 'POST', url: '/api/services', headers: { cookie }, payload: {} }))
        .statusCode,
    ).toBe(403);
  });
});
