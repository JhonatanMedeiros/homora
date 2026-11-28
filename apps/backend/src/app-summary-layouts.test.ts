import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { defaultClockConfig } from '@homora/widgets/clock';
import { summaryWidgetTypes } from '@homora/widgets/summary';
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
    const seeded = async (pageId: number) =>
      (
        (await req('GET', '/api/page-widgets')).json() as {
          id: number;
          pageId: number;
          type: string;
        }[]
      ).filter((row) => row.pageId === pageId);
    // A new installation and a new page both start with the whole Summary.
    for (const page of [home, lab])
      expect((await seeded(page)).map((row) => row.type)).toEqual([...summaryWidgetTypes]);
    const mine = await widget(home);
    const other = await widget(lab);
    const attention = (await seeded(home)).find((row) => row.type === 'summary-attention')!.id;
    const url = `/api/pages/${home}/summary-layout`;
    const desktop = [
      { widgetId: mine, width: 4, height: 2 },
      { widgetId: attention, width: 8, height: 5 },
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

    for (const bad of [
      { desktop: [{ widgetId: other, width: 4, height: 2 }], phone: null },
      { desktop: [{ widgetId: attention, width: 4, height: 2 }], phone: null },
      { desktop: [{ widgetId: -1, width: 4, height: 2 }], phone: null },
      { desktop: 'all', phone: null },
      { desktop: null, phone: null, add: [{ id: -1, type: 'nope' }] },
    ])
      expect((await req('PUT', url, { revision: 1, ...bad })).statusCode).toBe(400);
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

    // One edit removes widgets and creates others; only this page's can go.
    const add = [
      { id: -1, type: 'clock', name: 'Hall', config: defaultClockConfig, connectionId: null },
    ];
    const edit = await req('PUT', url, {
      revision: 1,
      desktop: [{ widgetId: -1, width: 4, height: 2 }, desktop[1]],
      phone: [{ widgetId: mine }, { widgetId: -1 }],
      add,
      remove: [mine, other, 9999],
    });
    expect(edit.statusCode).toBe(200);
    const hall = edit.json().desktop[0].widgetId as number;
    expect(hall).toBeGreaterThan(0);
    expect(edit.json().phone).toEqual([{ widgetId: hall }]);
    expect((await seeded(home)).map((row) => row.id)).not.toContain(mine);
    expect((await seeded(lab)).map((row) => row.id)).toContain(other);

    // A failed edit changes nothing at all.
    const failed = await req('PUT', url, {
      revision: 2,
      desktop: null,
      phone: null,
      add: Array.from({ length: 40 }, (_, index) => ({ ...add[0], id: -index - 1 })),
      remove: [hall],
    });
    expect(failed.statusCode).toBe(409);
    expect(failed.json().code).toBe('widget-limit');
    expect((await seeded(home)).map((row) => row.id)).toContain(hall);

    expect((await req('DELETE', `/api/page-widgets/${hall}`)).statusCode).toBe(204);
    expect((await req('GET', '/api/summary-layouts')).json()[0].desktop).toEqual([desktop[1]]);

    // Restoring the default keeps the revision moving, so an old editor cannot undo it.
    const reset = await req('PUT', url, { revision: 2, desktop: null, phone: null });
    expect(reset.json()).toEqual({ pageId: home, revision: 3, desktop: null, phone: null });
    expect((await req('PUT', url, { revision: 2, desktop, phone: null })).statusCode).toBe(409);

    await req('PUT', `/api/pages/${lab}/summary-layout`, {
      revision: 0,
      desktop: null,
      phone: [{ widgetId: other }],
    });
    // The deleted page's own widgets move; its Summary does not double the destination's.
    expect((await req('DELETE', `/api/pages/${lab}?moveTo=${home}`)).statusCode).toBeLessThan(300);
    const after = await seeded(home);
    expect(after.filter((row) => row.type.startsWith('summary-'))).toHaveLength(11);
    expect(after.map((row) => row.id)).toContain(other);
    expect(
      (await req('GET', '/api/summary-layouts'))
        .json()
        .map((entry: { pageId: number }) => entry.pageId),
    ).toEqual([home]);
    // A page holding nothing but its Summary is deleted without asking for a destination.
    const spare = (await req('POST', '/api/pages', { name: 'Spare' }))
      .json()
      .find((page: { name: string }) => page.name === 'Spare').id;
    expect((await req('DELETE', `/api/pages/${spare}`)).statusCode).toBeLessThan(300);
    expect(await seeded(spare)).toEqual([]);
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
    type Row = { id: number; pageId: number; type: string; name: string };
    const widgets = async (app: typeof source) =>
      (await app.req('GET', '/api/page-widgets')).json() as Row[];
    const home = (await source.req('GET', '/api/pages')).json()[0].id;
    // The source removes one Summary widget, adds a clock and arranges the page.
    const removed = (await widgets(source)).find((row) => row.type === 'summary-hosts')!.id;
    const status = (await widgets(source)).find((row) => row.type === 'summary-status')!.id;
    const saved = await source.req('PUT', `/api/pages/${home}/summary-layout`, {
      revision: 0,
      desktop: [
        { widgetId: -1, width: 6, height: 2 },
        { widgetId: status, width: 8, height: 1 },
      ],
      phone: [{ widgetId: status }],
      add: [
        { id: -1, type: 'clock', name: 'Kitchen', config: defaultClockConfig, connectionId: null },
      ],
      remove: [removed],
    });
    expect(saved.statusCode).toBe(200);
    const content = (await source.req('GET', '/api/config/export?format=json')).body;
    const exported = JSON.parse(content);
    expect(exported.widgets).toHaveLength(11);
    const clock = exported.widgets.findIndex((widget: Row) => widget.type === 'clock');
    expect(exported.summaryLayouts[0].desktop[0]).toEqual({ widget: clock, width: 6, height: 2 });

    // An untouched page takes the file's widgets and arrangement, without doubles.
    const applied = await target.req('POST', '/api/config/import/apply', { content });
    expect(applied.statusCode).toBe(200);
    const imported = await widgets(target);
    expect(imported.map((row) => row.type).sort()).toEqual(
      exported.widgets.map((widget: Row) => widget.type).sort(),
    );
    const byType = (type: string) => imported.find((row) => row.type === type)!.id;
    expect((await target.req('GET', '/api/summary-layouts')).json()).toMatchObject([
      {
        desktop: [
          { widgetId: byType('clock'), width: 6, height: 2 },
          { widgetId: byType('summary-status'), width: 8, height: 1 },
        ],
        phone: [{ widgetId: byType('summary-status') }],
      },
    ]);

    // A page that already holds just what the file describes is left alone.
    const plain = JSON.stringify({
      version: 7,
      groups: [],
      pages: ['Attic'],
      widgets: summaryWidgetTypes.map((type) => ({ page: 'Attic', type, name: '', config: {} })),
    });
    await target.req('POST', '/api/config/import/apply', { content: plain });
    const repeated = await target.req('POST', '/api/config/import/preview', { content: plain });
    expect(repeated.json().plan.summary.newWidgets).toBe(0);

    // A second import finds the page changed: no Summary widget is repeated, nothing rearranged.
    exported.summaryLayouts[0].desktop = [{ widget: clock, width: 12, height: 3 }];
    const preview = await target.req('POST', '/api/config/import/preview', {
      content: JSON.stringify(exported),
    });
    expect(preview.json().plan.summary.newWidgets).toBe(1);
    await target.req('POST', '/api/config/import/apply', { content: JSON.stringify(exported) });
    const again = await widgets(target);
    expect(again).toHaveLength(imported.length + summaryWidgetTypes.length + 1);
    expect((await target.req('GET', '/api/summary-layouts')).json()[0].desktop).toHaveLength(2);

    // The untouched page takes the file's widgets, narrowed ones included, and only once.
    const narrowed = JSON.stringify({
      version: 7,
      groups: [],
      pages: ['Attic'],
      widgets: [
        { page: 'Attic', type: 'summary-latency', name: '', config: {} },
        { page: 'Attic', type: 'summary-latency', name: '', config: { groups: ['Media'] } },
      ],
    });
    const latency = async () =>
      (await target.req('POST', '/api/config/import/preview', { content: narrowed })).json().plan
        .summary.newWidgets as number;
    expect(await latency()).toBe(2);
    await target.req('POST', '/api/config/import/apply', { content: narrowed });
    expect(await latency()).toBe(0);
    expect((await target.req('GET', '/api/config/export?format=json')).body).toContain('"Media"');

    // A widget with options marks its page as changed, so a file never replaces its Summary.
    const bad = await target.req('POST', '/api/page-widgets', {
      pageId: home,
      type: 'summary-figures',
      name: '',
      config: { groups: ['Media'] },
      connectionId: null,
    });
    expect(bad.statusCode).toBe(400);

    // A new page of an older file starts with the usual Summary beside the file's widgets.
    const older = {
      version: 6,
      groups: [],
      pages: ['Garage'],
      widgets: [{ page: 'Garage', type: 'clock', name: '', config: defaultClockConfig }],
    };
    await target.req('POST', '/api/config/import/apply', { content: JSON.stringify(older) });
    const garage = (await target.req('GET', '/api/pages'))
      .json()
      .find((page: { name: string }) => page.name === 'Garage').id;
    expect((await widgets(target)).filter((row) => row.pageId === garage)).toHaveLength(12);

    exported.summaryLayouts = [{ page: 'Home', desktop: [{ widgetId: 1 }] }];
    const invalid = await target.req('POST', '/api/config/import/preview', {
      content: JSON.stringify(exported),
    });
    expect(JSON.stringify(invalid.json())).toContain('summary-layout-invalid');
  } finally {
    await source.close();
    await target.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
