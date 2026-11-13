import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createAppTestContext } from './app-test-context.js';

const context = await createAppTestContext();
const { app, cookie } = context;
afterAll(context.close);
afterEach(context.clean);
describe('Configuration transfer API', () => {
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
});
