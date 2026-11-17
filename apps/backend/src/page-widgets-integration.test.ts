import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { defaultClockConfig } from '@homora/widgets/clock';
import { MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { expect, it } from 'vitest';
import { createApp } from './app.js';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';

it('persists, validates, reorders and moves page widgets without changing legacy widgets', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-page-widgets-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const sqlite = getSqliteHandle(db);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  expect((await app.inject({ method: 'GET', url: '/api/page-widgets' })).statusCode).toBe(401);
  const home = (await req('GET', '/api/pages')).json()[0].id;
  const pages = (await req('POST', '/api/pages', { name: 'Lab' })).json();
  const lab = pages.find((page: { name: string }) => page.name === 'Lab').id;
  const data = {
    pageId: lab,
    type: 'clock',
    name: '',
    config: defaultClockConfig,
    connectionId: null,
  };
  expect(
    (
      await req('POST', '/api/page-widgets', {
        ...data,
        config: { ...data.config, timeZone: 'invalid/zone' },
      })
    ).statusCode,
  ).toBe(400);
  expect((await req('POST', '/api/page-widgets', { ...data, connectionId: 1 })).statusCode).toBe(
    400,
  );
  const first = (await req('POST', '/api/page-widgets', data)).json();
  const second = (await req('POST', '/api/page-widgets', { ...data, name: 'Second' })).json();
  expect(
    (await req('PUT', '/api/page-widgets/order', { pageId: lab, ids: [first.id] })).statusCode,
  ).toBe(400);
  expect(
    (await req('PUT', '/api/page-widgets/order', { pageId: lab, ids: [second.id, first.id] }))
      .statusCode,
  ).toBe(200);
  expect((await req('DELETE', `/api/pages/${lab}`)).statusCode).toBe(409);
  expect((await req('DELETE', `/api/pages/${lab}?moveTo=${home}`)).statusCode).toBe(200);
  expect(
    (await req('GET', '/api/page-widgets'))
      .json()
      .map((row: { id: number; pageId: number }) => [row.id, row.pageId]),
  ).toEqual([
    [second.id, home],
    [first.id, home],
  ]);
  expect(sqlite.prepare('SELECT COUNT(*) AS n FROM integration_widgets').get()).toEqual({ n: 0 });
  expect((await req('DELETE', `/api/page-widgets/${first.id}`)).statusCode).toBe(204);
  await app.close();
});

it('exports portable clock configuration and rejects a stale import preview', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-widget-transfer-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const req = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  const pageId = (await req('GET', '/api/pages')).json()[0].id;
  const widget = {
    pageId,
    type: 'clock',
    name: 'UTC',
    config: { ...defaultClockConfig, timeZone: 'UTC' },
    connectionId: null,
  };
  expect((await req('POST', '/api/page-widgets', widget)).statusCode).toBe(201);
  const countdown = {
    pageId,
    type: 'countdown',
    name: '',
    connectionId: null,
    config: {
      eventName: 'Renewal',
      localDateTime: '2030-04-05T10:30',
      timeZone: 'UTC',
      pastBehavior: 'keep',
    },
  };
  expect((await req('POST', '/api/page-widgets', countdown)).statusCode).toBe(201);
  const note = {
    pageId,
    type: 'note',
    name: 'Reminder',
    connectionId: null,
    config: { text: '**Hello**' },
  };
  expect((await req('POST', '/api/page-widgets', note)).statusCode).toBe(201);
  const calendar = {
    pageId,
    type: 'calendar',
    name: '',
    connectionId: null,
    config: { weekStart: '1', timeZone: 'UTC' },
    size: 'wide',
  };
  expect((await req('POST', '/api/page-widgets', calendar)).statusCode).toBe(201);
  const content = (await req('GET', '/api/config/export?format=json')).body;
  expect(JSON.parse(content).widgets).toEqual([
    { page: 'Home', type: 'clock', name: 'UTC', config: widget.config },
    { page: 'Home', type: 'countdown', name: '', config: countdown.config },
    { page: 'Home', type: 'note', name: 'Reminder', config: note.config },
    { page: 'Home', type: 'calendar', name: '', config: calendar.config, size: 'wide' },
  ]);
  const preview = (await req('POST', '/api/config/import/preview', { content })).json();
  expect(preview.plan.summary.newWidgets).toBe(4);
  await req('POST', '/api/page-widgets', { ...widget, name: 'Changed' });
  expect(
    (await req('POST', '/api/config/import/apply', { content, expectedVersion: preview.version }))
      .statusCode,
  ).toBe(409);
  const next = (await req('POST', '/api/config/import/preview', { content })).json();
  expect(
    (await req('POST', '/api/config/import/apply', { content, expectedVersion: next.version }))
      .statusCode,
  ).toBe(200);
  expect((await req('GET', '/api/page-widgets')).json()).toHaveLength(9);
  expect(
    (await req('GET', '/api/page-widgets'))
      .json()
      .filter((item: { type: string }) => item.type === 'calendar'),
  ).toHaveLength(2);
  expect(
    (await req('GET', '/api/page-widgets'))
      .json()
      .filter((item: { type: string }) => item.type === 'countdown'),
  ).toHaveLength(2);
  await app.close();
});

it('accepts only a matching integration source and protects it from deletion', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-widget-source-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const sqlite = getSqliteHandle(db);
  sqlite
    .prepare(
      "INSERT INTO integration_instances(id,type,name,public_config) VALUES(7,'proxmox','Demo','{}')",
    )
    .run();
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const req = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  const pageId = (await req('GET', '/api/pages')).json()[0].id;
  const data = { pageId, type: 'proxmox', name: 'Lab', config: {}, connectionId: 7 };
  expect((await req('POST', '/api/page-widgets', { ...data, type: 'coolify' })).statusCode).toBe(
    400,
  );
  expect(
    (await req('POST', '/api/page-widgets', { ...data, config: { token: 'no' } })).statusCode,
  ).toBe(400);
  expect((await req('POST', '/api/page-widgets', data)).statusCode).toBe(201);
  expect((await req('DELETE', '/api/connections/7')).statusCode).toBe(409);
  const exported = JSON.parse((await req('GET', '/api/config/export?format=json')).body);
  expect(exported.widgets[0].source).toEqual({ type: 'proxmox', name: 'Demo' });
  expect(JSON.stringify(exported)).not.toContain('connectionId');
  await app.close();
});

it('holds at most the widget limit per page, for creating and for moving in', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-widget-limit-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  const home = (await req('GET', '/api/pages')).json()[0].id;
  const lab = (await req('POST', '/api/pages', { name: 'Lab' }))
    .json()
    .find((page: { name: string }) => page.name === 'Lab').id;
  const data = (pageId: number) => ({
    pageId,
    type: 'clock',
    name: '',
    config: defaultClockConfig,
    connectionId: null,
  });
  for (let index = 0; index < MAX_WIDGETS_PER_PAGE; index += 1)
    expect((await req('POST', '/api/page-widgets', data(lab))).statusCode).toBe(201);
  const refused = await req('POST', '/api/page-widgets', data(lab));
  expect(refused.statusCode).toBe(409);
  expect(refused.json().code).toBe('widget-limit');
  // Another page is not affected, and moving into the full page is refused too.
  const other = (await req('POST', '/api/page-widgets', data(home))).json();
  expect(other.id).toBeGreaterThan(0);
  expect((await req('PUT', `/api/page-widgets/${other.id}`, data(lab))).statusCode).toBe(409);
  // Editing a widget that already lives on the full page still works.
  const inLab = (await req('GET', '/api/page-widgets'))
    .json()
    .find((row: { pageId: number }) => row.pageId === lab);
  expect((await req('PUT', `/api/page-widgets/${inLab.id}`, data(lab))).statusCode).toBe(200);
  await app.close();
});

it('persists, edits and transfers local notes, rejecting invalid configuration', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-notes-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  const pageId = (await req('GET', '/api/pages')).json()[0].id;
  const note = {
    pageId,
    type: 'note',
    name: 'Lab',
    config: { text: '**Hello**' },
    connectionId: null,
  };
  expect(
    (await req('POST', '/api/page-widgets', { ...note, config: { text: 'a'.repeat(4001) } }))
      .statusCode,
  ).toBe(400);
  expect((await req('POST', '/api/page-widgets', { ...note, connectionId: 1 })).statusCode).toBe(
    400,
  );
  const created = (await req('POST', '/api/page-widgets', note)).json();
  expect(created.config).toEqual(note.config);
  expect(
    (await req('PUT', `/api/page-widgets/${created.id}`, { ...note, config: { text: 'Edited' } }))
      .statusCode,
  ).toBe(200);
  const content = (await req('GET', '/api/config/export?format=json')).body;
  expect(JSON.parse(content).widgets).toContainEqual({
    page: 'Home',
    type: 'note',
    name: 'Lab',
    config: { text: 'Edited' },
  });
  const preview = (await req('POST', '/api/config/import/preview', { content })).json();
  expect(preview.plan.summary.newWidgets).toBe(1);
  expect(
    (await req('POST', '/api/config/import/apply', { content, expectedVersion: preview.version }))
      .statusCode,
  ).toBe(200);
  expect(
    (await req('GET', '/api/page-widgets'))
      .json()
      .filter((row: { config: { text: string } }) => row.config.text === 'Edited'),
  ).toHaveLength(2);
  expect((await req('DELETE', `/api/page-widgets/${created.id}`)).statusCode).toBe(204);
  await app.close();
});

it('reads existing version-one rows without rewriting their configurations', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-widget-legacy-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const sqlite = getSqliteHandle(db);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const page = (await app.inject({ method: 'GET', url: '/api/pages', headers })).json()[0].id;
  const configs = [
    ['clock', defaultClockConfig],
    ['note', { text: 'old note' }],
    [
      'countdown',
      {
        eventName: 'Old event',
        localDateTime: '2030-01-01T12:00',
        timeZone: '',
        pastBehavior: 'keep',
      },
    ],
  ] as const;
  const insert = sqlite.prepare(
    'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,position) VALUES(?,?,?, ?,1,NULL,?)',
  );
  configs.forEach(([type, config], index) =>
    insert.run(page, type, '', JSON.stringify(config), index),
  );
  const result = (await app.inject({ method: 'GET', url: '/api/page-widgets', headers })).json();
  expect(result.map((row: { type: string; config: unknown }) => [row.type, row.config])).toEqual(
    configs,
  );
  await app.close();
});

it('persists, resizes, transfers, and validates rss-feed widgets', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-rss-feed-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  const pageId = (await req('GET', '/api/pages')).json()[0].id;

  const invalidFeed = {
    pageId,
    type: 'rss-feed',
    name: 'Feed',
    connectionId: null,
    config: {
      feedUrl: 'https://user:pass@example.com/feed.xml',
      title: '',
      limit: 5,
      allowPrivateNetwork: false,
    },
  };
  expect((await req('POST', '/api/page-widgets', invalidFeed)).statusCode).toBe(400);

  const validFeed = {
    pageId,
    type: 'rss-feed',
    name: 'Homelab News',
    connectionId: null,
    size: 'normal',
    config: {
      feedUrl: 'https://example.com/feed.xml',
      title: 'Releases',
      limit: 5,
      allowPrivateNetwork: false,
    },
  };
  const created = (await req('POST', '/api/page-widgets', validFeed)).json();
  expect(created.size).toBe('normal');

  const updated = (
    await req('PUT', `/api/page-widgets/${created.id}`, {
      ...validFeed,
      size: 'wide',
      config: { ...validFeed.config, limit: 8, allowPrivateNetwork: true },
    })
  ).json();
  expect(updated.size).toBe('wide');
  expect(updated.config.limit).toBe(8);
  expect(updated.config.allowPrivateNetwork).toBe(true);

  const content = (await req('GET', '/api/config/export?format=json')).body;
  expect(JSON.parse(content).widgets).toContainEqual({
    page: 'Home',
    type: 'rss-feed',
    name: 'Homelab News',
    size: 'wide',
    config: updated.config,
  });

  const preview = (await req('POST', '/api/config/import/preview', { content })).json();
  expect(preview.plan.summary.newWidgets).toBe(1);
  expect(
    (await req('POST', '/api/config/import/apply', { content, expectedVersion: preview.version }))
      .statusCode,
  ).toBe(200);
  expect((await req('GET', '/api/page-widgets')).json()).toHaveLength(2);
  expect((await req('DELETE', `/api/page-widgets/${created.id}`)).statusCode).toBe(204);
  await app.close();
});

it('persists, resizes, transfers, and validates weather widgets without storing API keys', async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-weather-widget-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const app = createApp(db, 5173, auth, createVault(path));
  const headers = { cookie, origin: 'http://localhost:5173' };
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  const pageId = (await req('GET', '/api/pages')).json()[0].id;

  const invalidWeather = {
    pageId,
    type: 'weather',
    name: 'Weather',
    connectionId: null,
    config: {
      provider: 'open-meteo',
      unit: 'metric',
      latitude: 95,
      longitude: 0,
      locationName: '',
    },
  };
  expect((await req('POST', '/api/page-widgets', invalidWeather)).statusCode).toBe(400);

  const validWeather = {
    pageId,
    type: 'weather',
    name: 'Local Weather',
    connectionId: null,
    size: 'normal',
    config: {
      provider: 'open-meteo',
      unit: 'metric',
      latitude: -23.5505,
      longitude: -46.6333,
      locationName: 'São Paulo',
    },
  };
  const created = (await req('POST', '/api/page-widgets', validWeather)).json();
  expect(created.size).toBe('normal');

  const updated = (
    await req('PUT', `/api/page-widgets/${created.id}`, {
      ...validWeather,
      size: 'wide',
      config: { ...validWeather.config, provider: 'openweathermap', unit: 'imperial' },
    })
  ).json();
  expect(updated.size).toBe('wide');
  expect(updated.config.provider).toBe('openweathermap');
  expect(updated.config.unit).toBe('imperial');

  const content = (await req('GET', '/api/config/export?format=json')).body;
  expect(JSON.parse(content).widgets).toContainEqual({
    page: 'Home',
    type: 'weather',
    name: 'Local Weather',
    size: 'wide',
    config: updated.config,
  });

  const preview = (await req('POST', '/api/config/import/preview', { content })).json();
  expect(preview.plan.summary.newWidgets).toBe(1);
  expect(
    (await req('POST', '/api/config/import/apply', { content, expectedVersion: preview.version }))
      .statusCode,
  ).toBe(200);
  expect((await req('GET', '/api/page-widgets')).json()).toHaveLength(2);
  expect((await req('DELETE', `/api/page-widgets/${created.id}`)).statusCode).toBe(204);
  await app.close();
});
