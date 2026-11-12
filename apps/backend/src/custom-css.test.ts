import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { CUSTOM_CSS_MAX_BYTES } from '@homora/shared';
import { createApp } from './app.js';
import { createCustomCss } from './custom-css.js';
import { createTestAuth } from './test-auth.js';

async function setup() {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestAuth(database.db);
  const app = createApp(database.db, 5173, auth);
  const headers = { origin: 'http://localhost:5173', cookie };
  const put = (payload: unknown) =>
    app.inject({
      method: 'PUT',
      url: '/api/appearance/custom-css',
      headers,
      payload: payload as object,
    });
  const get = async () =>
    (await app.inject({ method: 'GET', url: '/api/appearance/custom-css', headers })).json();
  const events = async () =>
    (await app.inject({ method: 'GET', url: '/api/activity', headers })).json<{
      events: { action: string; detail: string | null }[];
    }>().events;
  return { app, headers, put, get, events, sqlite: getSqliteHandle(database.db) };
}

const CSS = '[data-homora="service-card"] { border-radius: 1rem; }';

describe('custom CSS storage', () => {
  it('is empty and off by default, and never on without text', () => {
    const sqlite = getSqliteHandle(createDatabase(':memory:').db);
    const store = createCustomCss(sqlite);
    expect(store.get()).toMatchObject({ css: '', enabled: false, bytes: 0 });
    store.setEnabled(true);
    expect(store.get().enabled).toBe(false);
  });

  it('keeps the text when turned off', () => {
    const sqlite = getSqliteHandle(createDatabase(':memory:').db);
    const store = createCustomCss(sqlite);
    store.setCss(CSS);
    store.setEnabled(true);
    expect(store.get()).toMatchObject({ css: CSS, enabled: true });
    store.setEnabled(false);
    expect(store.get()).toMatchObject({ css: CSS, enabled: false });
  });
});

describe('custom CSS API', () => {
  it('requires a session', async () => {
    const { app } = await setup();
    for (const [method, url] of [
      ['GET', '/api/appearance/custom-css'],
      ['PUT', '/api/appearance/custom-css'],
      ['GET', '/api/appearance/custom.css'],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { origin: 'http://localhost:5173' },
        payload: method === 'PUT' ? { enabled: false } : undefined,
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('saves, enables and serves a same-origin stylesheet with safe headers', async () => {
    const { app, headers, put, get } = await setup();
    expect((await put({ css: CSS, enabled: true })).json()).toMatchObject({
      css: CSS,
      enabled: true,
    });
    expect(await get()).toMatchObject({ css: CSS, enabled: true });
    const sheet = await app.inject({ method: 'GET', url: '/api/appearance/custom.css', headers });
    expect(sheet.statusCode).toBe(200);
    expect(sheet.headers['content-type']).toBe('text/css; charset=utf-8');
    expect(sheet.headers['x-content-type-options']).toBe('nosniff');
    expect(sheet.body).toBe(CSS);
  });

  it('serves nothing while off, but keeps the text', async () => {
    const { app, headers, put, get } = await setup();
    await put({ css: CSS, enabled: true });
    await put({ enabled: false });
    expect(await get()).toMatchObject({ css: CSS, enabled: false });
    const sheet = await app.inject({ method: 'GET', url: '/api/appearance/custom.css', headers });
    expect(sheet.body).toBe('');
  });

  it('changes the version with the text so browsers fetch the new file', async () => {
    const { put } = await setup();
    const a = (await put({ css: CSS })).json().version;
    const b = (await put({ css: `${CSS} a{}` })).json().version;
    expect(a).not.toBe(b);
  });

  it.each([
    ['@import', '@import "https://x.example/a.css";', 'import'],
    ['an external url', 'a{background:url(https://x.example/a.png)}', 'external-url'],
    ['expression()', 'a{width:expression(alert(1))}', 'script'],
    ['javascript:', 'a{content:"javascript:alert(1)"}', 'script'],
    ['oversize text', `a{content:"${'x'.repeat(CUSTOM_CSS_MAX_BYTES)}"}`, 'too-large'],
  ])('rejects %s and stores nothing', async (_name, css, problem) => {
    const { put, get } = await setup();
    const response = await put({ css, enabled: true });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'custom-css-invalid', problem });
    expect(await get()).toMatchObject({ css: '', enabled: false });
  });

  it.each([
    ['unknown field', { css: CSS, extra: 1 }],
    ['nothing to change', {}],
    ['a non-string', { css: 1 }],
    ['a non-boolean flag', { enabled: 'yes' }],
  ])('rejects %s', async (_name, payload) => {
    const { put } = await setup();
    expect((await put(payload)).statusCode).toBe(400);
  });

  it('records changes without storing the stylesheet', async () => {
    const { put, events } = await setup();
    await put({ css: CSS, enabled: true });
    await put({ css: CSS, enabled: true });
    await put({ enabled: false });
    const log = (await events()).filter((event) => event.action === 'custom-css-update');
    expect(log.map((event) => event.detail).sort()).toEqual([
      'disabled',
      'enabled',
      `saved ${Buffer.byteLength(CSS)} bytes`,
    ]);
    expect(JSON.stringify(log)).not.toContain('border-radius');
  });
});
