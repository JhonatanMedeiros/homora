import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { registerWidgetMonitoringRoutes } from './widget-monitoring.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from '../app.js';
import { createTestSession } from '../test-auth.js';

it('requires the existing authenticated session', async () => {
  const database = createDatabase(':memory:');
  const { auth, cookie } = await createTestSession();
  const app = createApp(database.db, 5173, auth);
  expect((await app.inject('/api/widget-sources/monitoring/summary')).statusCode).toBe(401);
  const authenticated = await app.inject({
    url: '/api/widget-sources/monitoring/summary',
    headers: { cookie, origin: 'http://localhost:5173' },
  });
  expect(authenticated.statusCode).toBe(200);
  expect(authenticated.json().counts.unknown).toBe(0);
  await app.close();
  getSqliteHandle(database.db).close();
});

it('returns bounded, validated data and isolates failures between readers', async () => {
  const now = Date.now();
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE monitors(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER);
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY, service_id INTEGER, started_at INTEGER, ended_at INTEGER);
    INSERT INTO monitors VALUES (1,'A'),(2,'B');
    INSERT INTO service_monitor_settings VALUES (2,100);`);
  db.prepare('INSERT INTO service_incidents VALUES(1,1,?,NULL)').run(now - 5000);
  const rows = [
    { id: 1, name: 'A', url: 'https://example.test', allowPrivate: false, checkInterval: 60 },
    { id: 2, name: 'B', url: 'https://example.test', allowPrivate: false, checkInterval: 60 },
    { id: 3, name: 'Unmeasured', url: null, allowPrivate: false, checkInterval: 60 },
  ];
  const statuses = {
    1: {
      status: 'unavailable',
      reason: 'no-response',
      lastAttempt: new Date(now - 300_000).toISOString(),
      latencyMs: null,
    },
    2: {
      status: 'available',
      reason: 'responding',
      lastAttempt: new Date(now).toISOString(),
      latencyMs: 150,
    },
  };
  const app = Fastify();
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => rows } as never,
    { snapshot: () => statuses } as never,
    { open: () => ({ 1: { startedAt: now - 5000 } }) } as never,
    { current: () => null },
  );
  const summary = (await app.inject('/api/widget-sources/monitoring/summary')).json();
  expect(summary).toMatchObject({ counts: { down: 1, degraded: 1, unknown: 1 }, stale: 1 });
  const problems = (await app.inject('/api/widget-sources/monitoring/problems?limit=1')).json();
  expect(problems).toMatchObject({ items: [{ id: 1, stale: true }], truncated: true });
  expect(
    (await app.inject('/api/widget-sources/monitoring/incidents?days=7')).json(),
  ).toMatchObject({ items: [{ id: 1, monitorId: 1, name: 'A' }] });
  expect((await app.inject('/api/widget-sources/monitoring/incidents?days=31')).statusCode).toBe(
    400,
  );
  expect((await app.inject('/api/widget-sources/monitoring/problems?limit=51')).statusCode).toBe(
    400,
  );
  expect((await app.inject('/api/widget-sources/monitoring/unknown')).statusCode).toBe(404);
  rows[0].name = 'x'.repeat(201);
  expect((await app.inject('/api/widget-sources/monitoring/problems?limit=1')).json()).toEqual(
    problems,
  );
  expect((await app.inject('/api/widget-sources/monitoring/problems?limit=2')).statusCode).toBe(
    500,
  );
  expect((await app.inject('/api/widget-sources/monitoring/incidents?days=1')).statusCode).toBe(
    200,
  );
  await app.close();
  db.close();
});

it('returns explicit empty responses', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE monitors(id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER); CREATE TABLE service_incidents(id INTEGER, service_id INTEGER, started_at INTEGER, ended_at INTEGER);',
  );
  const app = Fastify();
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => [] } as never,
    { snapshot: () => ({}) } as never,
    { open: () => ({}) } as never,
    { current: () => null },
  );
  expect((await app.inject('/api/widget-sources/monitoring/summary')).json()).toMatchObject({
    counts: { down: 0, unknown: 0 },
    stale: 0,
  });
  expect((await app.inject('/api/widget-sources/monitoring/problems')).json()).toMatchObject({
    items: [],
    truncated: false,
  });
  expect((await app.inject('/api/widget-sources/monitoring/incidents')).json()).toMatchObject({
    items: [],
    truncated: false,
  });
  await app.close();
  db.close();
});

it('scopes summary to selected groups and pages without changing the default', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER);
    CREATE TABLE pages(id INTEGER PRIMARY KEY, position INTEGER);
    CREATE TABLE service_groups(id INTEGER PRIMARY KEY, name TEXT, page_id INTEGER);
    CREATE TABLE services(id INTEGER PRIMARY KEY, category TEXT);
    INSERT INTO pages VALUES (1,0),(2,1);
    INSERT INTO service_groups VALUES (10,'One',1),(20,'Two',2);
    INSERT INTO services VALUES (1,'One'),(2,'Two');`);
  const rows = [1, 2, 3].map((id) => ({ id, name: String(id), url: null, allowPrivate: false }));
  const app = Fastify();
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => rows } as never,
    { snapshot: () => ({}) } as never,
    { open: () => ({}) } as never,
    { current: () => null },
  );
  expect((await app.inject('/api/widget-sources/monitoring/summary')).json().counts.unknown).toBe(
    3,
  );
  expect(
    (await app.inject('/api/widget-sources/monitoring/summary?groups=10')).json().counts.unknown,
  ).toBe(1);
  expect(
    (await app.inject('/api/widget-sources/monitoring/summary?pages=2')).json().counts.unknown,
  ).toBe(1);
  expect(
    (await app.inject('/api/widget-sources/monitoring/summary?groups=10&pages=2')).json().counts
      .unknown,
  ).toBe(0);
  expect((await app.inject('/api/widget-sources/monitoring/problems?groups=10')).statusCode).toBe(
    400,
  );
  await app.close();
  db.close();
});
