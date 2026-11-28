import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it, vi } from 'vitest';
import { createServiceConfiguration } from '../service-configuration.js';
import { parseTransfer, serializeConfiguration } from './index.js';

vi.mock('@homora/integrations', async (original) => {
  const actual = await original<typeof import('@homora/integrations')>();
  return {
    ...actual,
    resolveWidget: (type: string) =>
      type === 'synthetic-internal'
        ? {
            type,
            version: 1,
            locations: ['page'],
            source: { contract: 'homora:monitoring-summary', version: 1 },
            parseConfig: (value: unknown) => value,
          }
        : actual.resolveWidget(type),
  };
});

it('exports, previews, and imports an internal widget without a connection, including version 3 files', () => {
  const first = createDatabase(':memory:');
  const second = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  const b = getSqliteHandle(second.db);
  // Only the widgets of this scenario.
  b.exec('DELETE FROM page_widgets');
  const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
  a.prepare(
    "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,'synthetic-internal','Summary','{}',1,NULL,'normal',0)",
  ).run(page);
  const data = createServiceConfiguration(a).exportData();
  expect(data.widgets).toEqual([
    { page: 'Home', type: 'synthetic-internal', name: 'Summary', config: {} },
  ]);
  const text = serializeConfiguration(data.groups, data.services, 'json', {
    pages: data.pages,
    widgets: data.widgets,
  });
  const old = JSON.parse(text);
  old.version = 3;
  const parsed = parseTransfer(JSON.stringify(old));
  const target = createServiceConfiguration(b);
  expect(target.previewImport(parsed).plan.widgets[0].status).toBe('new');
  expect(target.applyImport(parsed, { keepPrivate: false })).toMatchObject({
    status: 'applied',
    widgetsCreated: 1,
  });
  expect(b.prepare('SELECT type,connection_id AS connectionId FROM page_widgets').get()).toEqual({
    type: 'synthetic-internal',
    connectionId: null,
  });
  a.close();
  b.close();
});

it('round trips the homelab summary without a connection', () => {
  const first = createDatabase(':memory:');
  const second = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  const b = getSqliteHandle(second.db);
  // Only the widgets of this scenario.
  b.exec('DELETE FROM page_widgets');
  const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
  const config = { showUnmeasured: true, groups: ['Media'], pages: ['Home'] };
  a.prepare(
    "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,'homelab-summary','Summary',?,1,NULL,'normal',0)",
  ).run(page, JSON.stringify(config));
  const data = createServiceConfiguration(a).exportData();
  const parsed = parseTransfer(
    serializeConfiguration(data.groups, data.services, 'json', {
      pages: data.pages,
      widgets: data.widgets,
    }),
  );
  const target = createServiceConfiguration(b);
  expect(target.applyImport(parsed, { keepPrivate: false })).toMatchObject({
    status: 'applied',
    widgetsCreated: 1,
  });
  const row = b.prepare('SELECT config, connection_id AS connectionId FROM page_widgets').get() as {
    config: string;
    connectionId: number | null;
  };
  expect(JSON.parse(row.config)).toEqual(config);
  expect(row.connectionId).toBeNull();
  a.close();
  b.close();
});

it('round trips selected Home Assistant entities without exporting a local connection', () => {
  const first = createDatabase(':memory:');
  const second = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  const b = getSqliteHandle(second.db);
  // Only the widgets of this scenario.
  b.exec('DELETE FROM page_widgets');
  try {
    const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
    const config = { entities: ['sensor.temperature', 'light.living_room'] };
    a.prepare(
      'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,?,?,1,NULL,?,0)',
    ).run(page, 'home-assistant-entities', 'House states', JSON.stringify(config), 'normal');

    const data = createServiceConfiguration(a).exportData();
    expect(data.widgets).toEqual([
      {
        page: 'Home',
        type: 'home-assistant-entities',
        name: 'House states',
        config,
      },
    ]);
    const text = serializeConfiguration(data.groups, data.services, 'json', {
      pages: data.pages,
      widgets: data.widgets,
    });
    expect(text).not.toContain('connectionId');

    const parsed = parseTransfer(text);
    expect(parsed.document.widgets).toHaveLength(1);
    const target = createServiceConfiguration(b);
    expect(target.previewImport(parsed).plan.widgets[0].status).toBe('new');
    expect(target.applyImport(parsed, { keepPrivate: false })).toMatchObject({
      status: 'applied',
      widgetsCreated: 1,
    });
    const row = b
      .prepare('SELECT config,connection_id AS connectionId FROM page_widgets')
      .get() as { config: string; connectionId: number | null };
    expect(JSON.parse(row.config)).toEqual(config);
    expect(row.connectionId).toBeNull();
  } finally {
    a.close();
    b.close();
  }
});

it('round trips a recent incidents widget with portable filters and no connection', () => {
  const first = createDatabase(':memory:');
  const second = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  const b = getSqliteHandle(second.db);
  // Only the widgets of this scenario.
  b.exec('DELETE FROM page_widgets');
  const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
  const config = {
    periodDays: 30,
    limit: 10,
    groups: ['Infra'],
    pages: ['Home'],
    minimumMinutes: 5,
  };
  a.prepare(
    'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,?,?,1,NULL,?,0)',
  ).run(page, 'recent-incidents', 'Outages', JSON.stringify(config), 'wide');
  const data = createServiceConfiguration(a).exportData();
  const text = serializeConfiguration(data.groups, data.services, 'json', {
    pages: data.pages,
    widgets: data.widgets,
  });
  const target = createServiceConfiguration(b);
  const parsed = parseTransfer(text);
  expect(target.previewImport(parsed).plan.widgets[0].status).toBe('new');
  expect(target.applyImport(parsed, { keepPrivate: false })).toMatchObject({
    status: 'applied',
    widgetsCreated: 1,
  });
  const row = b
    .prepare('SELECT type, config, connection_id AS connectionId, size FROM page_widgets')
    .get() as { type: string; config: string; connectionId: null; size: string };
  expect(row).toMatchObject({ type: 'recent-incidents', connectionId: null, size: 'wide' });
  expect(JSON.parse(row.config)).toEqual(config);
  a.close();
  b.close();
});

it('round trips maintenance schedule filters and wide size without a connection', () => {
  const first = createDatabase(':memory:');
  const second = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  const b = getSqliteHandle(second.db);
  // Only the widgets of this scenario.
  b.exec('DELETE FROM page_widgets');
  try {
    const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
    const config = { days: 30, limit: 7, groups: ['Infra'], pages: ['Home'] };
    a.prepare(
      'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,?,?,1,NULL,?,0)',
    ).run(page, 'maintenance-schedule', 'Maintenance', JSON.stringify(config), 'wide');
    const data = createServiceConfiguration(a).exportData();
    const text = serializeConfiguration(data.groups, data.services, 'json', {
      pages: data.pages,
      widgets: data.widgets,
    });
    const target = createServiceConfiguration(b);
    const parsed = parseTransfer(text);
    expect(target.previewImport(parsed).plan.widgets[0].status).toBe('new');
    expect(target.applyImport(parsed, { keepPrivate: false })).toMatchObject({
      status: 'applied',
      widgetsCreated: 1,
    });
    const row = b
      .prepare('SELECT config,connection_id AS connectionId,size FROM page_widgets')
      .get() as { config: string; connectionId: null; size: string };
    expect(row).toMatchObject({ connectionId: null, size: 'wide' });
    expect(JSON.parse(row.config)).toEqual(config);
  } finally {
    a.close();
    b.close();
  }
});

it('strips local references from exports and even manually edited imports', () => {
  const first = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  try {
    const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
    const config = { target: 'a'.repeat(32), range: '30d' };
    a.prepare(
      'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,?,?,1,NULL,?,0)',
    ).run(page, 'latency-history', 'Latency', JSON.stringify(config), 'wide');
    const data = createServiceConfiguration(a).exportData();
    expect(data.widgets[0]).toMatchObject({ config: { target: null, range: '30d' }, size: 'wide' });
    const text = serializeConfiguration(data.groups, data.services, 'json', {
      pages: data.pages,
      widgets: data.widgets,
    });
    const edited = JSON.parse(text);
    edited.widgets[0].config.target = config.target;
    expect(parseTransfer(JSON.stringify(edited)).document.widgets?.[0].config).toEqual({
      target: null,
      range: '30d',
    });
  } finally {
    a.close();
  }
});

it('round trips the Healthchecks jobs widget without a local connection', () => {
  const first = createDatabase(':memory:');
  const second = createDatabase(':memory:');
  const a = getSqliteHandle(first.db);
  // Only the widgets of this scenario.
  a.exec('DELETE FROM page_widgets');
  const b = getSqliteHandle(second.db);
  // Only the widgets of this scenario.
  b.exec('DELETE FROM page_widgets');
  try {
    const page = (a.prepare('SELECT id FROM pages LIMIT 1').get() as { id: number }).id;
    a.prepare(
      "INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,'healthchecks-jobs','Jobs',?,1,NULL,'wide',0)",
    ).run(page, JSON.stringify({ limit: 5 }));
    const data = createServiceConfiguration(a).exportData();
    const text = serializeConfiguration(data.groups, data.services, 'json', {
      pages: data.pages,
      widgets: data.widgets,
    });
    expect(text).not.toContain('connectionId');
    const target = createServiceConfiguration(b);
    expect(target.applyImport(parseTransfer(text), { keepPrivate: false })).toMatchObject({
      status: 'applied',
      widgetsCreated: 1,
    });
    const row = b
      .prepare('SELECT config, connection_id AS connectionId, size FROM page_widgets')
      .get() as { config: string; connectionId: number | null; size: string };
    expect(JSON.parse(row.config)).toEqual({ limit: 5 });
    expect(row.connectionId).toBeNull();
    expect(row.size).toBe('wide');
  } finally {
    a.close();
    b.close();
  }
});
