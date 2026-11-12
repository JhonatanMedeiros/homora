import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { createTestAuth } from './test-auth.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { rootCertificates } from 'node:tls';
import { createVault } from './vault.js';
import { parseAllowedOrigins } from './config.js';
const database = createDatabase(':memory:');
const { auth, cookie } = await createTestAuth(database.db);
const app = createApp(database.db, 5173, auth);
afterEach(async () => {
  const response = await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } });
  for (const service of response.json() as { id: number }[])
    await app.inject({
      method: 'DELETE',
      url: `/api/services/${service.id}`,
      headers: { origin: 'http://localhost:5173', cookie },
    });
  const groups = await app.inject({ method: 'GET', url: '/api/groups', headers: { cookie } });
  for (const group of groups.json() as { id: number }[])
    await app.inject({
      method: 'DELETE',
      url: `/api/groups/${group.id}`,
      headers: { origin: 'http://localhost:5173', cookie },
    });
});
describe('Services API', () => {
  it('exports, previews, and imports configuration without overwriting anything', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers, payload: payload as object });
    for (const [name, category] of [
      ['Jellyfin', 'Mídia'],
      ['Proxmox', 'Infra'],
    ])
      await post('/api/services', {
        name,
        url: `http://localhost/${name}`,
        category,
        icon: 'lucide:server',
        allowPrivate: true,
      });
    expect((await app.inject({ method: 'GET', url: '/api/config/export' })).statusCode).toBe(401);
    const exported = await app.inject({
      method: 'GET',
      url: '/api/config/export?format=yaml',
      headers: { cookie },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-disposition']).toContain('homora-config.yaml');
    expect(exported.body).toContain('lucide:server');
    expect(exported.body).not.toContain('"id"');

    const preview = await post('/api/config/import/preview', { content: exported.body });
    expect(preview.json().plan.summary).toMatchObject({ newServices: 0, duplicates: 2 });
    const applied = await post('/api/config/import/apply', {
      content: exported.body,
      expectedVersion: preview.json().version,
    });
    expect(applied.statusCode).toBe(200);
    expect(applied.json().created).toBe(0);

    const fresh = `version: 1
groups:
  - name: Casa
    services:
      - { name: Pi-hole, url: "http://192.168.1.2/admin", allowPrivate: true }
      - { name: Quebrado, url: "nada" }
`;
    const plan = await post('/api/config/import/preview', { content: fresh });
    expect(plan.json().plan.summary).toMatchObject({ newGroups: 1, newServices: 1, errors: 1 });
    const stale = await post('/api/config/import/apply', {
      content: fresh,
      expectedVersion: plan.json().version - 1,
    });
    expect(stale.statusCode).toBe(409);
    const done = await post('/api/config/import/apply', {
      content: fresh,
      expectedVersion: plan.json().version,
    });
    expect(done.json().created).toBe(1);
    const list = (
      await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })
    ).json() as { name: string; category: string; allowPrivate: boolean }[];
    const imported = list.find((item) => item.name === 'Pi-hole');
    expect(imported).toMatchObject({ category: 'Casa', allowPrivate: false });
    expect(list.find((item) => item.name === 'Jellyfin')?.allowPrivate).toBe(true);
    const kept = await post('/api/config/import/apply', {
      content: fresh.replace('Pi-hole', 'Pi-hole 2').replace('/admin', '/outro'),
      keepPrivate: true,
    });
    expect(kept.json().created).toBe(1);
    expect(
      (
        (await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })).json() as {
          name: string;
          allowPrivate: boolean;
        }[]
      ).find((item) => item.name === 'Pi-hole 2')?.allowPrivate,
    ).toBe(true);
  });

  it('imports Homepage and Dashy files through the same reviewable preview', async () => {
    const headers = { origin: 'http://localhost:5173', cookie };
    const post = (url: string, payload: unknown) =>
      app.inject({ method: 'POST', url, headers, payload: payload as object });
    const homepage =
      '- Media:\n    - Jellyfin:\n        href: http://localhost:8096\n        icon: mdi-server\n';
    const dashy =
      'sections:\n  - name: Dev\n    items:\n      - { title: Gitea, url: "http://localhost:3000" }\n';
    const wrong = await post('/api/config/import/preview', { content: homepage });
    expect(wrong.json().plan.summary.errors).toBe(1);
    const plan = await post('/api/config/import/preview', {
      content: homepage,
      source: 'homepage',
    });
    expect(plan.json().plan.summary).toMatchObject({ newServices: 1, errors: 0 });
    const done = await post('/api/config/import/apply', {
      content: homepage,
      source: 'homepage',
      expectedVersion: plan.json().version,
    });
    expect(done.json().created).toBe(1);
    expect(
      (await post('/api/config/import/apply', { content: dashy, source: 'dashy' })).json().created,
    ).toBe(1);
    const list = (
      await app.inject({ method: 'GET', url: '/api/services', headers: { cookie } })
    ).json() as { name: string; category: string; icon: string; allowPrivate: boolean }[];
    expect(list.find((item) => item.name === 'Jellyfin')).toMatchObject({
      category: 'Media',
      icon: 'lucide:server',
      allowPrivate: false,
    });
    expect(list.find((item) => item.name === 'Gitea')?.category).toBe('Dev');
    expect(
      (await post('/api/config/import/preview', { content: homepage, source: 'outro' })).statusCode,
    ).toBe(400);
  });

  it('rejects import without allowed origin or with invalid body', async () => {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/config/import/preview',
          headers: { cookie },
          payload: { content: 'x' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/config/import/apply',
          headers: { origin: 'http://localhost:5173', cookie },
          payload: { content: 'x', extra: true },
        })
      ).statusCode,
    ).toBe(400);
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
    expect(response.json()).toEqual([
      { type: 'proxmox', label: 'Proxmox VE', capabilities: ['inventory'] },
      { type: 'jellyfin', label: 'Jellyfin', capabilities: ['server-info'] },
      { type: 'home-assistant', label: 'Home Assistant', capabilities: ['entity-state'] },
      { type: 'uptime-kuma', label: 'Uptime Kuma', capabilities: ['status-page'] },
      { type: 'adguard-home', label: 'AdGuard Home', capabilities: ['dns-status'] },
    ]);
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
    expect(batch.json()[id]).toMatchObject({ range: '24h', uptimePct: null, checks: 0 });
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
    expect(found.json()).toMatchObject({ recent: [], failingSince: null, lastSuccess: null });
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
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/proxmox/resources?refresh=perhaps',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(400);
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
      ['POST', '/api/proxmox/config'],
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

describe('API authentication', () => {
  const origin = 'http://localhost:5173';
  const account = {
    name: 'Administrator',
    email: 'admin@homora.test',
    password: 'super-secure-password',
  };
  function fresh(allowedOrigins: string[] = []) {
    const db = createDatabase(':memory:');
    const localAuth = createAuth({
      sqlite: getSqliteHandle(db.db),
      secret: 'x'.repeat(48),
      webPort: 5173,
      allowedOrigins,
    });
    const localApp = createApp(db.db, 5173, localAuth, undefined, allowedOrigins);
    return {
      localApp,
      signIn: (password: string, headers: Record<string, string> = { origin }) =>
        localApp.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          headers,
          payload: { email: account.email, password },
        }),
      setup: (headers: Record<string, string> = { origin }, payload: object = account) =>
        localApp.inject({ method: 'POST', url: '/api/auth/setup', headers, payload }),
      done: async () => {
        await localApp.close();
        db.close();
      },
    };
  }
  const cookieOf = (response: { headers: Record<string, unknown> }) =>
    String(response.headers['set-cookie']).split(';')[0];

  it('rate limits sign-in attempts and keeps limiting a blocked client', async () => {
    const { signIn, setup, done } = fresh();
    try {
      await setup();
      for (let attempt = 0; attempt < 10; attempt++)
        expect((await signIn('wrong-password')).statusCode).toBe(401);
      expect((await signIn('wrong-password')).statusCode).toBe(429);
      expect((await signIn(account.password)).statusCode).toBe(429);
    } finally {
      await done();
    }
  });

  it('creates the account once, authenticates, and terminates the session', async () => {
    const { localApp, signIn, setup, done } = fresh();
    try {
      expect((await localApp.inject({ method: 'GET', url: '/api/services' })).statusCode).toBe(401);
      expect((await localApp.inject({ method: 'GET', url: '/api/auth/status' })).json()).toEqual({
        configured: false,
        authenticated: false,
      });
      expect((await setup({ origin }, { password: 'only-a-password' })).statusCode).toBe(400);
      expect((await setup({ origin }, { ...account, email: 'not-an-email' })).statusCode).toBe(400);
      expect((await setup({ origin }, { ...account, password: 'short' })).statusCode).toBe(400);
      expect((await setup()).statusCode).toBe(201);
      expect((await setup({ origin }, { ...account, email: 'other@homora.test' })).statusCode).toBe(
        403,
      );
      expect((await signIn('wrong-password')).statusCode).toBe(401);
      const login = await signIn(account.password);
      expect(login.statusCode).toBe(200);
      const setCookie = String(login.headers['set-cookie']);
      expect(setCookie).toContain('homora.session_token=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Max-Age=28800');
      expect(setCookie).not.toContain('Secure');
      const cookie = cookieOf(login);
      expect(
        (await localApp.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
          .statusCode,
      ).toBe(200);
      expect(
        (
          await localApp.inject({ method: 'GET', url: '/api/auth/status', headers: { cookie } })
        ).json(),
      ).toEqual({ configured: true, authenticated: true });
      await localApp.inject({
        method: 'POST',
        url: '/api/auth/sign-out',
        headers: { origin, cookie },
      });
      expect(
        (await localApp.inject({ method: 'GET', url: '/api/services', headers: { cookie } }))
          .statusCode,
      ).toBe(401);
    } finally {
      await done();
    }
  });

  it('never creates a second account, even from simultaneous setups', async () => {
    const { localApp, setup, done } = fresh();
    try {
      const results = await Promise.all(
        [1, 2, 3, 4].map((n) => setup({ origin }, { ...account, email: `admin${n}@homora.test` })),
      );
      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 403, 403, 403]);
      expect((await localApp.inject({ method: 'GET', url: '/api/auth/status' })).json()).toEqual({
        configured: true,
        authenticated: false,
      });
    } finally {
      await done();
    }
  });

  it('keeps public sign-up and unused Better Auth routes closed', async () => {
    const { localApp, setup, signIn, done } = fresh();
    try {
      await setup();
      const cookie = cookieOf(await signIn(account.password));
      for (const [method, url] of [
        ['POST', '/api/auth/sign-up/email'],
        ['POST', '/api/auth/change-password'],
        ['GET', '/api/auth/list-sessions'],
        ['POST', '/api/auth/request-password-reset'],
      ] as const) {
        const response = await localApp.inject({
          method,
          url,
          headers: { origin, cookie },
          payload: method === 'POST' ? {} : undefined,
        });
        expect(response.statusCode, url).toBe(404);
      }
    } finally {
      await done();
    }
  });

  it('rejects sign-in from an origin that is not allowed', async () => {
    const { signIn, setup, done } = fresh();
    try {
      await setup();
      expect((await signIn(account.password, { origin: 'http://evil.example' })).statusCode).toBe(
        403,
      );
    } finally {
      await done();
    }
  });

  it('sets Secure on allowed HTTPS sign-in and sign-out', async () => {
    const https = { origin: 'https://homora.example' };
    const { localApp, setup, signIn, done } = fresh(['https://homora.example']);
    try {
      expect((await setup(https)).statusCode).toBe(201);
      const login = await signIn(account.password, https);
      expect(login.statusCode).toBe(200);
      expect(String(login.headers['set-cookie'])).toContain('; Secure');
      const logout = await localApp.inject({
        method: 'POST',
        url: '/api/auth/sign-out',
        headers: { ...https, cookie: cookieOf(login) },
      });
      expect(logout.statusCode).toBe(200);
      expect(String(logout.headers['set-cookie'])).toContain('; Secure');
    } finally {
      await done();
    }
  });
});

describe('HOMORA_ALLOWED_ORIGINS', () => {
  it('splits exact origins, eliminates duplicates, and rejects invalid values', () => {
    expect(
      parseAllowedOrigins('https://homora.example, http://localhost:8080,https://homora.example'),
    ).toEqual(['https://homora.example', 'http://localhost:8080']);
    for (const value of [
      'https://example.test/path',
      'https://example.test/',
      'http://example.test',
      '*,https://ok.test',
      'https://u:p@example.test',
    ])
      expect(() => parseAllowedOrigins(value)).toThrow();
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

it('updates and removes CA without erasing existing credentials', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-api-vault-'));
  const vault = createVault(join(dir, 'db'));
  const localApp = createApp(database.db, 5173, auth, vault);
  const headers = { origin: 'http://localhost:5173', cookie };
  try {
    await vault.save({
      url: 'https://pve.example:8006',
      tokenId: 'user@pve!homora',
      secret: 'secret',
    });
    const ca = rootCertificates[0];
    for (const payload of [{ url: 'https://other.example:8006' }, { tokenId: 'other@pve!token' }]) {
      for (const route of ['/api/proxmox/config', '/api/proxmox/test']) {
        const response = await localApp.inject({ method: 'POST', url: route, headers, payload });
        expect(response.statusCode).toBe(400);
        expect(response.json().code).toBe('secret-required');
      }
    }
    expect(vault.load()?.secret).toBe('secret');
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/proxmox/config',
          headers,
          payload: { ca },
        })
      ).statusCode,
    ).toBe(200);
    expect(vault.load()).toEqual({
      url: 'https://pve.example:8006',
      tokenId: 'user@pve!homora',
      secret: 'secret',
      ca,
    });
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/proxmox/config',
          headers,
          payload: { ca: 'invalid' },
        })
      ).statusCode,
    ).toBe(400);
    expect(vault.load()?.ca).toBe(ca);
    expect(
      (
        await localApp.inject({
          method: 'POST',
          url: '/api/proxmox/config',
          headers,
          payload: { removeCa: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(vault.load()).toEqual({
      url: 'https://pve.example:8006',
      tokenId: 'user@pve!homora',
      secret: 'secret',
    });
  } finally {
    await localApp.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
