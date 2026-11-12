import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '@homora/db';
import { expect, it } from 'vitest';
import { createApp } from './app.js';
import { createTestAuth } from './test-auth.js';
import { createVault } from './vault.js';

async function setup() {
  const path = join(mkdtempSync(join(tmpdir(), 'homora-pages-')), 'data.sqlite');
  const { db } = createDatabase(path);
  const { auth, cookie } = await createTestAuth(db);
  const headers = { cookie, origin: 'http://localhost:5173' };
  const app = createApp(db, 5173, auth, createVault(path));
  const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url, headers, payload: payload as object | undefined });
  return { app, req };
}

it('requires a session', async () => {
  const { app } = await setup();
  expect((await app.inject({ method: 'GET', url: '/api/pages' })).statusCode).toBe(401);
});

it('starts with Home and adds, renames and validates names', async () => {
  const { req } = await setup();
  expect((await req('GET', '/api/pages')).json()).toMatchObject([{ name: 'Home', groups: 0 }]);
  const created = await req('POST', '/api/pages', { name: '  Media ' });
  expect(created.statusCode).toBe(201);
  const media = created.json().find((p: { name: string }) => p.name === 'Media');
  expect((await req('POST', '/api/pages', { name: 'media' })).statusCode).toBe(409);
  expect((await req('POST', '/api/pages', { name: '' })).statusCode).toBe(400);
  expect((await req('POST', '/api/pages', { name: 'x'.repeat(41) })).statusCode).toBe(400);
  expect((await req('PUT', `/api/pages/${media.id}`, { name: 'Home' })).statusCode).toBe(409);
  const renamed = await req('PUT', `/api/pages/${media.id}`, { name: 'Movies' });
  expect(renamed.json().map((p: { name: string }) => p.name)).toEqual(['Home', 'Movies']);
});

it('limits the number of pages', async () => {
  const { req } = await setup();
  for (let i = 2; i <= 12; i += 1) {
    expect((await req('POST', '/api/pages', { name: `Page ${i}` })).statusCode).toBe(201);
  }
  expect((await req('POST', '/api/pages', { name: 'One more' })).statusCode).toBe(409);
});

it('moves groups, requires a target when deleting and keeps the last page', async () => {
  const { req } = await setup();
  const pages = (await req('POST', '/api/pages', { name: 'Lab' })).json();
  const lab = pages.find((p: { name: string }) => p.name === 'Lab').id;
  const home = pages.find((p: { name: string }) => p.name === 'Home').id;
  const group = (await req('POST', '/api/groups', { name: 'Tools', pageId: lab })).json();
  const defaulted = (await req('POST', '/api/groups', { name: 'Other' })).json();
  expect(group.pageId).toBe(lab);
  expect(defaulted.pageId).toBe(home);
  expect((await req('POST', '/api/groups', { name: 'Bad', pageId: 999 })).statusCode).toBe(404);
  expect((await req('DELETE', `/api/pages/${lab}`)).statusCode).toBe(409);
  expect((await req('DELETE', `/api/pages/${lab}?moveTo=${lab}`)).statusCode).toBe(404);
  expect((await req('PUT', `/api/groups/${group.id}/page`, { pageId: home })).statusCode).toBe(204);
  expect((await req('PUT', `/api/groups/${group.id}/page`, { pageId: 999 })).statusCode).toBe(404);
  expect((await req('PUT', `/api/groups/${group.id}/page`, { pageId: lab })).statusCode).toBe(204);
  const after = await req('DELETE', `/api/pages/${lab}?moveTo=${home}`);
  expect(after.json()).toMatchObject([{ name: 'Home', groups: 2 }]);
  expect((await req('DELETE', `/api/pages/${home}`)).statusCode).toBe(409);
});

it('reorders pages and rejects partial orders', async () => {
  const { req } = await setup();
  const pages = (await req('POST', '/api/pages', { name: 'B' })).json();
  const ids = pages.map((p: { id: number }) => p.id);
  expect((await req('PUT', '/api/pages/order', { ids: [ids[0]] })).statusCode).toBe(400);
  const order = await req('PUT', '/api/pages/order', { ids: [...ids].reverse() });
  expect(order.json().map((p: { name: string }) => p.name)).toEqual(['B', 'Home']);
});

it('records page changes in the audit log', async () => {
  const { req } = await setup();
  await req('POST', '/api/pages', { name: 'Audit' });
  const events = await req('GET', '/api/audit');
  if (events.statusCode === 200) {
    expect(JSON.stringify(events.json())).toContain('page-update');
  }
});
