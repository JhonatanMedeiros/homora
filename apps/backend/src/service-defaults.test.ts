import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createTestSession } from './test-auth.js';
import { createProposalService } from './proposals.js';
import { createServiceConfiguration } from './service-configuration.js';
import type { DockerSource } from './docker-discovery.js';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

const containers = [
  { Id: 'a'.repeat(12), Names: ['/plex'], Labels: { 'homora.url': 'http://192.168.1.20:32400' } },
];

async function setup() {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const source = { list: async () => containers } as unknown as DockerSource;
  const app = createApp(database.db, 5173, auth, undefined, [], source);
  closers.push(async () => {
    await app.close();
    database.close();
  });
  const headers = { origin: 'http://localhost:5173', cookie };
  const send = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  const setDefault = (allowPrivate: boolean) =>
    send('PUT', '/api/service-defaults', { allowPrivate });
  const create = async (payload: object = {}) =>
    (
      await send('POST', '/api/services', {
        name: 'NAS',
        url: 'http://192.168.1.10:5000',
        category: 'Home',
        ...payload,
      })
    ).json<{ id: number; allowPrivate: boolean }>();
  const list = async () =>
    (await send('GET', '/api/services')).json<{ name: string; allowPrivate: boolean }[]>();
  return { app, database, send, setDefault, create, list };
}

describe('new services allow private network setting', () => {
  it('is off by default and keeps UI-created services blocked', async () => {
    const { send, create } = await setup();
    expect((await send('GET', '/api/service-defaults')).json()).toEqual({ allowPrivate: false });
    expect((await create()).allowPrivate).toBe(false);
  });

  it('starts UI-created services with private network allowed when on, unless the request says otherwise', async () => {
    const { send, setDefault, create } = await setup();
    expect((await setDefault(true)).json()).toEqual({ allowPrivate: true });
    expect((await send('GET', '/api/service-defaults')).json()).toEqual({ allowPrivate: true });
    expect((await create()).allowPrivate).toBe(true);
    expect((await create({ name: 'Explicit', allowPrivate: false })).allowPrivate).toBe(false);
  });

  it('never changes existing services, on toggle or on edit', async () => {
    const { send, setDefault, create, list } = await setup();
    const before = await create();
    await setDefault(true);
    expect((await list())[0].allowPrivate).toBe(false);
    const edited = await send('PUT', `/api/services/${before.id}`, {
      name: 'NAS',
      url: 'http://192.168.1.10:5000',
      category: 'Home',
    });
    expect(edited.json().allowPrivate).toBe(false);
    await setDefault(false);
    const kept = await create({ name: 'On', allowPrivate: true });
    await setDefault(false);
    expect((await list()).find((s) => s.name === 'On')?.allowPrivate).toBe(true);
    expect(kept.allowPrivate).toBe(true);
  });

  it('requires authentication, validates input and is audited', async () => {
    const { app, send, setDefault } = await setup();
    const origin = { origin: 'http://localhost:5173' };
    expect((await app.inject({ method: 'GET', url: '/api/service-defaults' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/service-defaults',
          headers: origin,
          payload: { allowPrivate: true },
        })
      ).statusCode,
    ).toBe(401);
    expect((await send('PUT', '/api/service-defaults', { allowPrivate: 'yes' })).statusCode).toBe(
      400,
    );
    expect(
      (await send('PUT', '/api/service-defaults', { allowPrivate: true, x: 1 })).statusCode,
    ).toBe(400);
    await setDefault(true);
    await setDefault(true);
    await setDefault(false);
    const events = (await send('GET', '/api/activity')).json<{
      events: { action: string; detail: string | null }[];
    }>().events;
    expect(
      events.filter((e) => e.action === 'service-defaults-update').map((e) => e.detail),
    ).toEqual(['allow-private:off', 'allow-private:on']);
  });
});

describe('the setting does not leak into other creation paths', () => {
  it('config import keeps services blocked', async () => {
    const { send, setDefault, list } = await setup();
    await setDefault(true);
    const content = JSON.stringify({
      version: 1,
      groups: [{ name: 'Media', services: [{ name: 'Imported', url: 'http://192.168.1.30/' }] }],
    });
    const applied = await send('POST', '/api/config/import/apply', { content });
    expect(applied.json().created).toBe(1);
    expect((await list())[0]).toMatchObject({ name: 'Imported', allowPrivate: false });
  });

  it('Docker local discovery keeps services blocked', async () => {
    const { send, setDefault, list } = await setup();
    await setDefault(true);
    const found = (await send('GET', '/api/discovery')).json();
    const imported = await send('POST', '/api/discovery/import', {
      ids: [found.entries[0].id],
      expectedVersion: found.version,
    });
    expect(imported.json().created).toBe(1);
    expect((await list())[0].allowPrivate).toBe(false);
  });

  it('Docker push discovery keeps services blocked', async () => {
    const { app, send, setDefault, list } = await setup();
    await setDefault(true);
    const source = (await send('POST', '/api/discovery/sources', { name: 'A' })).json();
    const pushed = await app.inject({
      method: 'POST',
      url: '/docker-push/inventory',
      headers: { authorization: `Bearer ${source.token}` },
      payload: { containers: [{ ...containers[0], Id: 'b'.repeat(64) }] },
    });
    expect(pushed.statusCode).toBe(204);
    const preview = (await send('GET', `/api/discovery/sources/${source.id}/suggestions`)).json();
    const imported = await send('POST', `/api/discovery/sources/${source.id}/import`, {
      ids: [preview.entries[0].id],
      inventoryVersion: preview.source.version,
      expectedVersion: preview.version,
    });
    expect(imported.json().created).toBe(1);
    expect((await list())[0].allowPrivate).toBe(false);
  });

  it('agent proposals keep services blocked', async () => {
    const { database, setDefault, list } = await setup();
    await setDefault(true);
    const sqlite = getSqliteHandle(database.db);
    const proposals = createProposalService(sqlite, createServiceConfiguration(sqlite));
    const agent = proposals.issue('bot', ['proposals:create']);
    const proposal = proposals.propose(agent.id, {
      op: 'create',
      service: { name: 'Proposed', url: 'http://192.168.1.40/', category: 'Home' },
    });
    expect(proposals.decide(proposal.id, true, 'human')).toBe('approved');
    expect((await list())[0]).toMatchObject({ name: 'Proposed', allowPrivate: false });
  });
});
