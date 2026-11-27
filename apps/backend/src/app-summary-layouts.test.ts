import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { defaultClockConfig } from '@homora/widgets/clock';
import { expect, it } from 'vitest';
import { createApp } from './app.js';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';

it('saves a Summary per page, rejects stale and foreign edits and forgets deleted widgets', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'homora-summary-layout-'));
  const path = join(directory, 'data.sqlite');
  const database = createDatabase(path);
  const sqlite = getSqliteHandle(database.db);
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth, createVault(path));
  try {
    const headers = { cookie, origin: 'http://localhost:5173' };
    const req = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
      app.inject({ method, url, headers, payload: payload as object | undefined });
    expect((await app.inject({ method: 'GET', url: '/api/summary-layouts' })).statusCode).toBe(401);
    const home = (await req('GET', '/api/pages')).json()[0].id;
    const lab = (await req('POST', '/api/pages', { name: 'Lab' }))
      .json()
      .find((page: { name: string }) => page.name === 'Lab').id;
    const widget = async (pageId: number) =>
      (
        await req('POST', '/api/page-widgets', {
          pageId,
          type: 'clock',
          name: '',
          config: defaultClockConfig,
          connectionId: null,
        })
      ).json().id as number;
    const mine = await widget(home);
    const other = await widget(lab);
    const url = `/api/pages/${home}/summary-layout`;
    const desktop = [
      { widgetId: mine, width: 4, height: 2, hidden: false },
      { block: 'attention', width: 8, height: 5, hidden: true },
    ];
    expect((await req('GET', '/api/summary-layouts')).json()).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url,
          headers: { origin: headers.origin },
          payload: { revision: 0, desktop, phone: null },
        })
      ).statusCode,
    ).toBe(401);

    const saved = await req('PUT', url, { revision: 0, desktop, phone: null });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ pageId: home, revision: 1, desktop, phone: null });

    const stale = await req('PUT', url, { revision: 0, desktop: null, phone: null });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('summary-layout-conflict');

    const foreign = await req('PUT', url, {
      revision: 1,
      desktop: [{ widgetId: other, width: 4, height: 2, hidden: false }],
      phone: null,
    });
    expect(foreign.statusCode).toBe(400);
    expect((await req('PUT', url, { revision: 1, desktop: 'all', phone: null })).statusCode).toBe(
      400,
    );
    expect(
      (
        await req('PUT', '/api/pages/999/summary-layout', {
          revision: 0,
          desktop: null,
          phone: null,
        })
      ).statusCode,
    ).toBe(404);
    expect((await req('GET', '/api/summary-layouts')).json()[0].desktop).toEqual(desktop);

    expect((await req('DELETE', `/api/page-widgets/${mine}`)).statusCode).toBe(204);
    expect((await req('GET', '/api/summary-layouts')).json()[0].desktop).toEqual([desktop[1]]);

    // Restoring the default keeps the revision moving, so an old editor cannot undo it.
    const reset = await req('PUT', url, { revision: 1, desktop: null, phone: null });
    expect(reset.json()).toEqual({ pageId: home, revision: 2, desktop: null, phone: null });
    expect((await req('PUT', url, { revision: 1, desktop, phone: null })).statusCode).toBe(409);

    await req('PUT', `/api/pages/${lab}/summary-layout`, {
      revision: 0,
      desktop: null,
      phone: [{ widgetId: other, hidden: true }],
    });
    expect((await req('DELETE', `/api/pages/${lab}?moveTo=${home}`)).statusCode).toBeLessThan(300);
    expect(
      (await req('GET', '/api/summary-layouts'))
        .json()
        .map((entry: { pageId: number }) => entry.pageId),
    ).toEqual([home]);
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    await app.close();
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

it('carries each page Summary through export and import without rearranging existing pages', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'homora-summary-transfer-'));
  const open = async (name: string) => {
    const path = join(directory, name);
    const database = createDatabase(path);
    const { auth, cookie } = await createTestSession();
    const app = createApp(database.db, 5173, auth, createVault(path));
    const headers = { cookie, origin: 'http://localhost:5173' };
    const req = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
      app.inject({ method, url, headers, payload: payload as object | undefined });
    return {
      req,
      close: async () => {
        await app.close();
        database.close();
      },
    };
  };
  const source = await open('source.sqlite');
  const target = await open('target.sqlite');
  try {
    const home = (await source.req('GET', '/api/pages')).json()[0].id;
    const widget = (
      await source.req('POST', '/api/page-widgets', {
        pageId: home,
        type: 'clock',
        name: 'Kitchen',
        config: defaultClockConfig,
        connectionId: null,
      })
    ).json().id;
    const layout = {
      desktop: [
        { widgetId: widget, width: 6, height: 2, hidden: false },
        { block: 'attention', width: 8, height: 5, hidden: true },
      ],
      phone: [{ block: 'status', hidden: false }],
    };
    await source.req('PUT', `/api/pages/${home}/summary-layout`, { revision: 0, ...layout });
    const content = (await source.req('GET', '/api/config/export?format=json')).body;
    expect(JSON.parse(content).summaryLayouts[0].desktop[0]).toEqual({
      widget: 0,
      width: 6,
      height: 2,
      hidden: false,
    });

    const applied = await target.req('POST', '/api/config/import/apply', { content });
    expect(applied.statusCode).toBe(200);
    const created = (await target.req('GET', '/api/page-widgets')).json()[0].id;
    expect((await target.req('GET', '/api/summary-layouts')).json()).toMatchObject([
      {
        desktop: [{ ...layout.desktop[0], widgetId: created }, layout.desktop[1]],
        phone: layout.phone,
      },
    ]);

    // A second import finds the page already arranged and leaves it alone.
    const changed = JSON.parse(content);
    changed.summaryLayouts[0].desktop = [{ block: 'pinned', width: 12, height: 1, hidden: false }];
    await target.req('POST', '/api/config/import/apply', { content: JSON.stringify(changed) });
    expect((await target.req('GET', '/api/summary-layouts')).json()[0].desktop).toHaveLength(2);

    changed.summaryLayouts = [{ page: 'Home', desktop: [{ block: 'nope' }] }];
    const preview = await target.req('POST', '/api/config/import/preview', {
      content: JSON.stringify(changed),
    });
    expect(JSON.stringify(preview.json())).toContain('summary-layout-invalid');
  } finally {
    await source.close();
    await target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
