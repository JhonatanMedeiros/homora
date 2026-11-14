import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { createServiceConfiguration } from './service-configuration.js';
import { createTestSession } from './test-auth.js';

const closers: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()?.();
});

type Link = {
  id: number;
  url: string;
  name: string;
  openTarget: string | null;
  type: { id: number; name: string; color: string } | null;
};
type Svc = { id: number; name: string; links: Link[] };

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
  const base = {
    name: 'Nextcloud',
    url: 'https://cloud.example.com',
    category: 'Home',
    description: '',
  };
  const create = async (payload: object = {}) =>
    (await send('POST', '/api/services', { ...base, ...payload })).json<Svc>();
  const list = async () => (await send('GET', '/api/services')).json<Svc[]>();
  const makeType = async (name: string, color = 'green') =>
    (await send('POST', '/api/link-types', { name, color })).json<{ id: number; name: string }>();
  return { app, database, send, base, create, list, makeType };
}

describe('extra addresses on a service', () => {
  it('stores addresses in order with their type, and lists them with the card', async () => {
    const { send, create, list, makeType, base } = await setup();
    const lan = await makeType('LAN');
    const created = await create({
      links: [
        { url: 'http://192.168.1.5:8080', typeId: lan.id },
        { url: 'https://cloud.example.com/admin', name: 'Painel', openTarget: 'same-tab' },
      ],
    });
    expect(created.links.map((link) => link.url)).toEqual([
      'http://192.168.1.5:8080/',
      'https://cloud.example.com/admin',
    ]);
    const [service] = await list();
    expect(service.links[0]).toMatchObject({
      name: '',
      openTarget: null,
      type: { id: lan.id, name: 'LAN', color: 'green' },
    });
    expect(service.links[1]).toMatchObject({ name: 'Painel', openTarget: 'same-tab', type: null });
    // Reordering and editing replace the whole list.
    const reordered = await send('PUT', `/api/services/${service.id}`, {
      ...base,
      links: [
        { url: 'https://cloud.example.com/admin', name: 'Painel' },
        { url: 'http://192.168.1.5:8080', typeId: lan.id },
      ],
    });
    expect(reordered.json<Svc>().links.map((link) => link.name)).toEqual(['Painel', '']);
  });

  it('allows the same address more than once', async () => {
    const { create } = await setup();
    const service = await create({
      links: [{ url: 'http://192.168.1.5' }, { url: 'http://192.168.1.5', name: 'Again' }],
    });
    expect(service.links).toHaveLength(2);
  });

  it('keeps addresses when an edit omits them and removes them with an empty list', async () => {
    const { send, create, list, base } = await setup();
    const service = await create({ links: [{ url: 'http://192.168.1.5' }] });
    await send('PUT', `/api/services/${service.id}`, { ...base, name: 'Renamed' });
    expect((await list())[0]).toMatchObject({
      name: 'Renamed',
      links: [{ url: 'http://192.168.1.5/' }],
    });
    await send('PUT', `/api/services/${service.id}`, { ...base, name: 'Renamed', links: [] });
    expect((await list())[0].links).toEqual([]);
  });

  it('rejects invalid addresses without changing the card', async () => {
    const { send, create, list, base } = await setup();
    const service = await create({ links: [{ url: 'http://192.168.1.5' }] });
    for (const links of [
      [{ url: 'javascript:alert(1)' }],
      [{ url: 'http://user:secret@192.168.1.5' }],
      [{ url: 'http://192.168.1.5', name: 'x'.repeat(81) }],
      [{ url: 'http://192.168.1.5', typeId: 999 }],
      Array.from({ length: 11 }, () => ({ url: 'http://192.168.1.5' })),
    ]) {
      const response = await send('PUT', `/api/services/${service.id}`, {
        ...base,
        name: 'Should not be saved',
        links,
      });
      expect(response.statusCode).toBe(400);
      expect(['invalid-links', 'invalid-data']).toContain(response.json().code);
    }
    expect((await list())[0]).toMatchObject({
      name: 'Nextcloud',
      links: [{ url: 'http://192.168.1.5/' }],
    });
    // A new card with bad addresses is not created either.
    expect(
      (await send('POST', '/api/services', { ...base, name: 'Ghost', links: [{ url: 'nope' }] }))
        .statusCode,
    ).toBe(400);
    expect((await list()).map((item) => item.name)).toEqual(['Nextcloud']);
  });

  it('removes the addresses with the card', async () => {
    const { send, create, database } = await setup();
    const service = await create({ links: [{ url: 'http://192.168.1.5' }] });
    await send('DELETE', `/api/services/${service.id}`);
    expect(
      getSqliteHandle(database.db).prepare('SELECT COUNT(*) AS n FROM service_links').get(),
    ).toEqual({ n: 0 });
  });

  it('keeps addresses when a reviewed proposal edits the card without them', async () => {
    const { database, create, send } = await setup();
    const service = await create({ alias: 'cloud', links: [{ url: 'http://192.168.1.5' }] });
    const configuration = createServiceConfiguration(getSqliteHandle(database.db));
    configuration.applyProposal({
      op: 'update',
      id: service.id,
      service: {
        name: 'By agent',
        url: 'https://cloud.example.com',
        category: 'Home',
        description: '',
      },
    });
    const [after] = (await send('GET', '/api/services')).json<Svc[]>();
    expect(after).toMatchObject({
      name: 'By agent',
      alias: 'cloud',
      links: [{ url: 'http://192.168.1.5/' }],
    });
  });
});

describe('link types', () => {
  it('creates, renames, recolors and lists types with their usage', async () => {
    const { send, create, makeType } = await setup();
    const lan = await makeType('LAN');
    await create({ links: [{ url: 'http://192.168.1.5', typeId: lan.id }] });
    const renamed = await send('PUT', `/api/link-types/${lan.id}`, {
      name: 'Rede local',
      color: 'teal',
    });
    expect(renamed.json()).toEqual({ id: lan.id, name: 'Rede local', color: 'teal' });
    expect((await send('GET', '/api/link-types')).json()).toEqual([
      { id: lan.id, name: 'Rede local', color: 'teal', uses: 1 },
    ]);
  });

  it.each([
    ['empty name', { name: '  ', color: 'green' }],
    ['long name', { name: 'x'.repeat(25), color: 'green' }],
    ['red is not offered', { name: 'Down', color: 'red' }],
    ['no color', { name: 'LAN' }],
  ])('rejects %s', async (_label, body) => {
    const { send } = await setup();
    expect((await send('POST', '/api/link-types', body)).statusCode).toBe(400);
  });

  it('rejects a repeated name ignoring case, also when renaming', async () => {
    const { send, makeType } = await setup();
    await makeType('LAN');
    const other = await makeType('Admin', 'ember');
    expect((await send('POST', '/api/link-types', { name: 'lan', color: 'blue' })).statusCode).toBe(
      409,
    );
    const clash = await send('PUT', `/api/link-types/${other.id}`, { name: 'LAN' });
    expect(clash.statusCode).toBe(409);
    expect(clash.json().code).toBe('link-type-exists');
    // Keeping its own name while recoloring is fine.
    expect(
      (await send('PUT', `/api/link-types/${other.id}`, { name: 'admin', color: 'pink' }))
        .statusCode,
    ).toBe(200);
  });

  it('stops at 20 types', async () => {
    const { send, makeType } = await setup();
    for (let index = 0; index < 20; index += 1) await makeType(`Type ${index}`);
    const extra = await send('POST', '/api/link-types', { name: 'One more', color: 'blue' });
    expect(extra.statusCode).toBe(409);
    expect(extra.json().code).toBe('link-type-limit');
  });

  it('deleting a type keeps the addresses that used it', async () => {
    const { send, create, list, makeType } = await setup();
    const lan = await makeType('LAN');
    await create({ links: [{ url: 'http://192.168.1.5', typeId: lan.id }] });
    const deleted = await send('DELETE', `/api/link-types/${lan.id}`);
    expect(deleted.json()).toEqual({ deleted: true, uses: 1 });
    expect((await list())[0].links).toMatchObject([{ url: 'http://192.168.1.5/', type: null }]);
    expect((await send('DELETE', `/api/link-types/${lan.id}`)).statusCode).toBe(404);
    expect((await send('PUT', '/api/link-types/abc', { name: 'x' })).statusCode).toBe(404);
  });

  it('needs a session', async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: 'GET',
      url: '/api/link-types',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('export and import', () => {
  it('round-trips addresses and creates missing types, keeping a local type color', async () => {
    const source = await setup();
    const lan = await source.makeType('LAN', 'green');
    const docs = await source.makeType('Docs', 'neutral');
    await source.create({
      alias: 'cloud',
      links: [
        { url: 'http://192.168.1.5:8080', typeId: lan.id, openTarget: 'same-tab' },
        { url: 'https://docs.example.com', name: 'Manual', typeId: docs.id },
        { url: 'https://cloud.example.com/status' },
      ],
    });
    const exported = (await source.send('GET', '/api/config/export?format=json')).body;
    const document = JSON.parse(exported) as {
      version: number;
      groups: { services: { links: unknown[] }[] }[];
    };
    expect(document.version).toBe(5);
    expect(document.groups[0].services[0].links).toHaveLength(3);
    expect(exported).toContain('"alias": "cloud"');
    expect(exported).not.toContain('typeId');

    const target = await setup();
    // The target already has a "lan" type in another color: it is reused, not overwritten.
    const local = await target.makeType('lan', 'violet');
    const preview = await target.send('POST', '/api/config/import/preview', { content: exported });
    expect(preview.json().plan.issues).toEqual([]);
    expect(
      (await target.send('POST', '/api/config/import/apply', { content: exported })).statusCode,
    ).toBe(200);
    const [imported] = await target.list();
    expect(imported).toMatchObject({ alias: 'cloud' });
    expect(
      imported.links.map((link) => [link.url, link.name, link.openTarget, link.type?.name]),
    ).toEqual([
      ['http://192.168.1.5:8080/', '', 'same-tab', 'lan'],
      ['https://docs.example.com/', 'Manual', null, 'Docs'],
      ['https://cloud.example.com/status', '', null, undefined],
    ]);
    expect(imported.links[0].type).toEqual({ id: local.id, name: 'lan', color: 'violet' });
    expect(imported.links[1].type?.color).toBe('neutral');
  });

  it('reads files without addresses and older versions', async () => {
    const { send, list } = await setup();
    const content = JSON.stringify({
      version: 3,
      groups: [{ name: 'Home', services: [{ name: 'Old', url: 'https://old.example.com' }] }],
    });
    expect((await send('POST', '/api/config/import/apply', { content })).statusCode).toBe(200);
    expect((await list())[0].links).toEqual([]);
  });

  it('skips invalid addresses with a warning and caps a card at 10', async () => {
    const { send, list } = await setup();
    const content = JSON.stringify({
      version: 4,
      groups: [
        {
          name: 'Home',
          services: [
            {
              name: 'Many',
              url: 'https://many.example.com',
              links: [
                { url: 'javascript:alert(1)' },
                { url: 'http://u:p@host.example' },
                ...Array.from({ length: 11 }, (_, index) => ({
                  url: `http://10.0.0.${index + 1}`,
                })),
              ],
            },
          ],
        },
      ],
    });
    const preview = (await send('POST', '/api/config/import/preview', { content })).json();
    const codes = preview.plan.issues.map((issue: { code: string }) => issue.code);
    expect(codes.filter((code: string) => code === 'link-ignored')).toHaveLength(2);
    expect(codes).toContain('link-limit');
    await send('POST', '/api/config/import/apply', { content });
    expect((await list())[0].links).toHaveLength(10);
  });

  it('stops creating types at the limit but still imports the address', async () => {
    const { send, list, makeType } = await setup();
    for (let index = 0; index < 20; index += 1) await makeType(`Type ${index}`);
    const content = JSON.stringify({
      version: 4,
      groups: [
        {
          name: 'Home',
          services: [
            {
              name: 'App',
              url: 'https://app.example.com',
              links: [{ url: 'http://10.0.0.1', type: { name: 'Brand new', color: 'pink' } }],
            },
          ],
        },
      ],
    });
    expect((await send('POST', '/api/config/import/apply', { content })).statusCode).toBe(200);
    expect((await list())[0].links).toMatchObject([{ url: 'http://10.0.0.1/', type: null }]);
  });
});

describe('short aliases', () => {
  it('protects resolution, preserves edits and releases aliases on removal', async () => {
    const { app, send, base } = await setup();
    const created = await send('POST', '/api/services', { ...base, alias: 'cloud' });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: number }>().id;
    const anonymous = await app.inject({ method: 'GET', url: '/api/go/cloud' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.headers['cache-control']).toBe('no-store');
    expect((await send('GET', '/api/go/cloud?url=https://evil.test')).json()).toEqual({
      url: 'https://cloud.example.com/',
    });
    expect((await send('POST', '/api/services', { ...base, alias: 'cloud' })).statusCode).toBe(409);
    for (const alias of ['Upper', '-bad', 'two--hyphens', 'a b', 'x'.repeat(64)]) {
      const invalid = await send('PUT', `/api/services/${id}`, { ...base, alias });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ code: 'invalid-alias' });
    }
    expect(
      (
        await send('PUT', `/api/services/${id}`, {
          ...base,
          name: 'Renamed',
          url: 'https://new.example.test',
        })
      ).statusCode,
    ).toBe(200);
    expect((await send('GET', '/api/go/cloud')).json()).toEqual({
      url: 'https://new.example.test/',
    });
    expect((await send('PUT', `/api/services/${id}`, { ...base, alias: null })).statusCode).toBe(
      200,
    );
    expect((await send('GET', '/api/go/cloud')).statusCode).toBe(404);
    expect((await send('POST', '/api/services', { ...base, alias: 'cloud' })).statusCode).toBe(201);
  });
});
