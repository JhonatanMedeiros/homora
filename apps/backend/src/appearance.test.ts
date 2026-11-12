import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { APPEARANCE_KEY, DEFAULT_APPEARANCE } from '@homora/shared';
import { createApp } from './app.js';
import { createAppearance } from './appearance.js';
import { createTestSession } from './test-auth.js';

async function setup() {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);
  const sqlite = getSqliteHandle(database.db);
  const headers = { origin: 'http://localhost:5173', cookie };
  const put = (payload: unknown) =>
    app.inject({ method: 'PUT', url: '/api/appearance', headers, payload: payload as object });
  const events = async () =>
    (await app.inject({ method: 'GET', url: '/api/activity', headers })).json<{
      events: { action: string; detail: string | null }[];
    }>().events;
  return { app, sqlite, headers, put, events };
}

const valid = {
  version: 2,
  image: null,
  accent: 'moss',
  customAccent: null,
  background: 'dusk',
  cardOpacity: 80,
  blur: true,
};

describe('appearance storage', () => {
  it('returns the default when nothing is stored', () => {
    const { sqlite } = { sqlite: getSqliteHandle(createDatabase(':memory:').db) };
    expect(createAppearance(sqlite).get()).toEqual(DEFAULT_APPEARANCE);
  });

  it.each(['not json', '{"version":9}', '{"version":1,"accent":"nope"}', '[]'])(
    'falls back to the default for a damaged value (%s)',
    (value) => {
      const sqlite = getSqliteHandle(createDatabase(':memory:').db);
      sqlite.prepare('INSERT INTO app_settings(key,value) VALUES(?,?)').run(APPEARANCE_KEY, value);
      expect(createAppearance(sqlite).get()).toEqual(DEFAULT_APPEARANCE);
    },
  );
});

describe('appearance API', () => {
  it('requires a session', async () => {
    const { app } = await setup();
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      const response = await app.inject({
        method,
        url: '/api/appearance',
        headers: { origin: 'http://localhost:5173' },
        payload: method === 'PUT' ? valid : undefined,
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('serves the default look until something is saved', async () => {
    const { app, headers } = await setup();
    const response = await app.inject({ method: 'GET', url: '/api/appearance', headers });
    expect(response.json()).toEqual({ appearance: DEFAULT_APPEARANCE });
  });

  it('saves, serves and resets an appearance', async () => {
    const { app, headers, put } = await setup();
    const saved = await put(valid);
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ appearance: valid });
    const read = await app.inject({ method: 'GET', url: '/api/appearance', headers });
    expect(read.json()).toEqual({ appearance: valid });
    const reset = await app.inject({ method: 'DELETE', url: '/api/appearance', headers });
    expect(reset.json()).toEqual({ appearance: DEFAULT_APPEARANCE });
  });

  it.each([
    ['unknown field', { ...valid, extra: true }],
    ['unknown preset', { ...valid, accent: 'lime' }],
    ['opacity out of range', { ...valid, cardOpacity: 30 }],
    ['an external background', { ...valid, background: 'url(https://example.test/a.png)' }],
    ['a bad custom color', { ...valid, accent: 'custom', customAccent: 'javascript:1' }],
  ])('rejects %s without storing it', async (_name, payload) => {
    const { app, headers, put } = await setup();
    const response = await put(payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('invalid-data');
    const read = await app.inject({ method: 'GET', url: '/api/appearance', headers });
    expect(read.json()).toEqual({ appearance: DEFAULT_APPEARANCE });
  });

  it('refuses a custom accent below 3:1 and says which combination fails', async () => {
    const { app, headers, put } = await setup();
    const response = await put({ ...valid, accent: 'custom', customAccent: '#ffe066' });
    expect(response.statusCode).toBe(422);
    const body = response.json<{ code: string; problems: { code: string; theme: string }[] }>();
    expect(body.code).toBe('appearance-contrast');
    expect(body.problems.some((p) => p.code === 'accent' && p.theme === 'light')).toBe(true);
    const read = await app.inject({ method: 'GET', url: '/api/appearance', headers });
    expect(read.json()).toEqual({ appearance: DEFAULT_APPEARANCE });
  });

  it('accepts a custom accent that passes', async () => {
    const { put } = await setup();
    const response = await put({ ...valid, accent: 'custom', customAccent: '#2F7D6B' });
    expect(response.statusCode).toBe(200);
    expect(response.json().appearance.customAccent).toBe('#2f7d6b');
  });

  it('records changes in the activity log with a short summary only', async () => {
    const { app, headers, put, events } = await setup();
    await put(valid);
    await app.inject({ method: 'DELETE', url: '/api/appearance', headers });
    await put({ ...valid, accent: 'custom', customAccent: '#ffe066' });
    const log = (await events()).filter((event) => event.action.startsWith('appearance-'));
    expect(log.map((event) => event.action).sort()).toEqual([
      'appearance-reset',
      'appearance-update',
    ]);
    const update = log.find((event) => event.action === 'appearance-update');
    expect(update?.detail).toBe('accent:moss background:dusk opacity:80 blur:on');
  });
});

describe('export of settings', () => {
  it('serves appearance and custom CSS in the export, never the picture', async () => {
    const { app, headers, put } = await setup();
    await put({ ...valid });
    await app.inject({
      method: 'PUT',
      url: '/api/appearance/custom-css',
      headers,
      payload: { css: 'a { color: red }', enabled: true },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/api/config/export?format=json',
      headers,
    });
    const document = response.json();
    expect(document.appearance).toMatchObject({ accent: 'moss', image: null });
    expect(document.customCss).toEqual({ enabled: true, css: 'a { color: red }' });
  });
});
