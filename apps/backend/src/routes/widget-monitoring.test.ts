import Fastify from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
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
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY, service_id INTEGER, started_at INTEGER, ended_at INTEGER, reason TEXT, http_status INTEGER);
    CREATE TABLE services(id INTEGER, category TEXT); CREATE TABLE service_groups(id INTEGER, name TEXT, page_id INTEGER); CREATE TABLE pages(id INTEGER, name TEXT);
    INSERT INTO monitors VALUES (1,'A'),(2,'B');
    INSERT INTO service_monitor_settings VALUES (2,100);`);
  db.prepare("INSERT INTO service_incidents VALUES(1,1,?,NULL,'no-response',NULL)").run(now - 5000);
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
    'CREATE TABLE monitors(id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER); CREATE TABLE service_incidents(id INTEGER, service_id INTEGER, started_at INTEGER, ended_at INTEGER, reason TEXT, http_status INTEGER); CREATE TABLE services(id INTEGER, category TEXT); CREATE TABLE service_groups(id INTEGER, name TEXT, page_id INTEGER); CREATE TABLE pages(id INTEGER, name TEXT);',
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
  expect(
    (await app.inject('/api/widget-sources/monitoring/problems?groups=invalid')).statusCode,
  ).toBe(400);
  await app.close();
  db.close();
});

it('filters before limiting, keeps long open incidents, and exposes only safe reason vocabulary', async () => {
  const now = Date.now();
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE monitors(id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE services(id INTEGER, category TEXT);
    CREATE TABLE service_groups(id INTEGER, name TEXT, page_id INTEGER);
    CREATE TABLE pages(id INTEGER, name TEXT);
    CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER);
    CREATE TABLE service_incidents(id INTEGER, service_id INTEGER, started_at INTEGER, ended_at INTEGER, reason TEXT, http_status INTEGER);
    INSERT INTO monitors VALUES (1,'A'),(2,'B'),(3,'Probe');
    INSERT INTO services VALUES (1,'Infra'),(2,'Other');
    INSERT INTO service_groups VALUES (1,'Infra',1),(2,'Other',2);
    INSERT INTO pages VALUES (1,'Home'),(2,'Lab');`);
  const insert = db.prepare('INSERT INTO service_incidents VALUES(?,?,?,?,?,?)');
  insert.run(1, 1, now - 40 * 86_400_000, null, 'no-response', null);
  insert.run(2, 1, now - 300_000, now - 60_000, 'error-status', 503);
  insert.run(3, 2, now - 100_000, now - 60_000, 'secret response body', 999);
  insert.run(4, 3, now - 200_000, null, 'secret response body', null);
  const app = Fastify();
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => [] } as never,
    { snapshot: () => ({}) } as never,
    { open: () => ({}) } as never,
    { current: () => null },
  );
  const all = (await app.inject('/api/widget-sources/monitoring/incidents?days=1&limit=2')).json();
  expect(all.items.map((item: { id: number }) => item.id)).toEqual([4, 1]);
  expect(all.items[0]).toMatchObject({ reason: 'other', hasService: false, httpStatus: null });
  expect(all.truncated).toBe(true);
  expect(JSON.stringify(all)).not.toContain('secret response body');
  const filtered = (
    await app.inject(
      `/api/widget-sources/monitoring/incidents?days=1&limit=2&minimumMinutes=2&groups=${encodeURIComponent(JSON.stringify(['Infra']))}&pages=${encodeURIComponent(JSON.stringify(['Home']))}`,
    )
  ).json();
  expect(filtered.items.map((item: { id: number }) => item.id)).toEqual([1, 2]);
  expect(filtered.items[1]).toMatchObject({
    reason: 'error-status',
    httpStatus: 503,
    hasService: true,
  });
  expect(filtered.truncated).toBe(false);
  for (const query of [
    'days=31',
    'limit=51',
    'minimumMinutes=43201',
    'groups=garbage',
    'pages=%5B%221%22%2C%221%22%5D',
  ])
    expect((await app.inject(`/api/widget-sources/monitoring/incidents?${query}`)).statusCode).toBe(
      400,
    );
  await app.close();
  db.close();
});

it('filters before counting and limiting, orders by age, and excludes maintenance and unmeasured monitors', async () => {
  const now = Date.now();
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY, category TEXT);
    CREATE TABLE service_groups(id INTEGER PRIMARY KEY, name TEXT, page_id INTEGER);
    CREATE TABLE pages(id INTEGER PRIMARY KEY, name TEXT, position INTEGER);
    CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER);
    INSERT INTO pages VALUES(1,'Home',0),(2,'Other',1);
    INSERT INTO service_groups VALUES(1,'Media',1),(2,'Work',2);
    INSERT INTO services VALUES(1,'Media'),(2,'Media'),(3,'Media'),(4,'Media'),(5,'Media'),(6,'Work'),(7,'Media');
    INSERT INTO service_monitor_settings VALUES(3,100);`);
  const targets = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    name: `Monitor ${index + 1}`,
    url: 'https://example.test',
    allowPrivate: false,
    checkInterval: 60,
  }));
  const statuses = {
    1: { status: 'unavailable', reason: 'error-status', httpStatus: 503 },
    2: { status: 'unavailable', reason: 'no-response' },
    3: { status: 'available', latencyMs: 150 },
    4: { status: 'unavailable', reason: 'maintenance' },
    5: { status: 'unknown', reason: 'unchecked' },
    6: { status: 'unavailable', reason: 'private response body secret' },
    7: { status: 'unavailable', reason: 'destination-blocked' },
    8: { status: 'unavailable', reason: 'no-response' },
  };
  const app = Fastify();
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => targets } as never,
    { snapshot: () => statuses } as never,
    {
      open: () => ({
        1: { startedAt: now - 1000, reason: 'error-status', httpStatus: 503 },
        2: { startedAt: now - 5000, reason: 'no-response' },
        8: { startedAt: now - 10000, reason: 'no-response' },
      }),
    } as never,
    { current: () => null },
  );
  const params = new URLSearchParams({
    pages: '1',
    groups: '1',
    limit: '1',
  });
  const reading = (await app.inject(`/api/widget-sources/monitoring/problems?${params}`)).json();
  expect(reading).toMatchObject({
    total: 3,
    unmeasured: 2,
    truncated: true,
    items: [{ id: 2, isService: true, reason: 'no-response' }],
  });
  params.set('includeDegraded', 'false');
  params.set('limit', '10');
  const offline = (await app.inject(`/api/widget-sources/monitoring/problems?${params}`)).json();
  expect(offline.total).toBe(2);
  expect(offline.items.map((item: { id: number }) => item.id)).toEqual([2, 1]);
  expect(offline.items[1]).toMatchObject({ reason: 'error-status', httpStatus: 503 });
  const all = (await app.inject('/api/widget-sources/monitoring/problems?limit=10')).json();
  expect(all.items[0]).toMatchObject({ id: 8, isService: false });
  expect(JSON.stringify(all)).not.toContain('private response body secret');
  expect(all.items.find((item: { id: number }) => item.id === 6).reason).toBeNull();
  expect((await app.inject('/api/widget-sources/monitoring/problems?pages=bad')).statusCode).toBe(
    400,
  );
  await app.close();
  db.close();
});

it('orders degraded monitors by first observed degradation before applying the limit', async () => {
  const { createDegradedSince } = await import('../monitoring/index.js');
  const now = Date.now();
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY, category TEXT);
    CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER);
    INSERT INTO services VALUES (1,'A'),(2,'A');
    INSERT INTO service_monitor_settings VALUES (1,100),(2,100);`);
  const targets = [1, 2].map((id) => ({
    id,
    name: String(id),
    url: 'https://example.test',
    allowPrivate: false,
    checkInterval: 60,
  }));
  const status = (at: number) => ({
    status: 'available',
    reason: 'responding',
    latencyMs: 200,
    httpStatus: 200,
    lastAttempt: new Date(at).toISOString(),
  });
  const tracker = createDegradedSince(db);
  tracker.observe(targets as never, { 1: status(now - 1000), 2: status(now - 5000) } as never, now);
  const app = Fastify();
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => targets } as never,
    { snapshot: () => ({ 1: status(now - 1000), 2: status(now - 5000) }) } as never,
    { open: () => ({}) } as never,
    { current: () => null },
    tracker,
  );
  const response = (await app.inject('/api/widget-sources/monitoring/problems?limit=1')).json();
  expect(response).toMatchObject({
    total: 2,
    truncated: true,
    items: [{ id: 2, state: 'degraded', since: now - 5000 }],
  });
  await app.close();
  db.close();
});

it('returns availability for services and probes, enforcing min 5 checks and excluding maintenance/unknown', async () => {
  const { serviceSignature: signature } = await import('../monitoring/index.js');
  const now = Date.now();
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY, category TEXT);
    CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER);
    CREATE TABLE service_observation_history(
      id INTEGER PRIMARY KEY,
      service_id INTEGER,
      signature TEXT,
      observed_at INTEGER,
      observation TEXT,
      status TEXT GENERATED ALWAYS AS (json_extract(observation,'$.status')) VIRTUAL,
      latency_ms REAL GENERATED ALWAYS AS (json_extract(observation,'$.latencyMs')) VIRTUAL
    );
    INSERT INTO services VALUES (1,'Media');`);
  const targets = [
    {
      id: 1,
      name: 'Jellyfin',
      url: 'https://jellyfin.example.test',
      allowPrivate: false,
      checkInsecure: false,
      checkType: 'http' as const,
      checkInterval: 60,
      expectedStatus: null,
      checkPath: null,
      checkUrl: null,
      checkMatch: null,
    },
    {
      id: 2,
      name: 'DNS Probe',
      url: 'https://dns.example.test',
      allowPrivate: false,
      checkInsecure: false,
      checkType: 'http' as const,
      checkInterval: 60,
      expectedStatus: null,
      checkPath: null,
      checkUrl: null,
      checkMatch: null,
    },
  ];
  const insert = db.prepare(
    'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
  );
  const jellyfinSig = signature(targets[0]);
  for (let i = 0; i < 4; i++) {
    insert.run(
      1,
      jellyfinSig,
      now - (i + 1) * 60_000,
      JSON.stringify({ status: 'available', latencyMs: 40 }),
    );
  }
  insert.run(
    1,
    jellyfinSig,
    now - 300_000,
    JSON.stringify({ status: 'unavailable', reason: 'no-response' }),
  );
  insert.run(1, jellyfinSig, now - 360_000, JSON.stringify({ status: 'maintenance' }));
  insert.run(1, jellyfinSig, now - 420_000, JSON.stringify({ status: 'unknown' }));

  const probeSig = signature(targets[1]);
  for (let i = 0; i < 3; i++) {
    insert.run(
      2,
      probeSig,
      now - (i + 1) * 60_000,
      JSON.stringify({ status: 'available', latencyMs: 12 }),
    );
  }
  insert.run(2, probeSig, now - 240_000, JSON.stringify({ status: 'maintenance' }));

  const app = Fastify();
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => targets } as never,
    {
      snapshot: () => ({
        1: {
          status: 'available',
          reason: 'responding',
          latencyMs: 40,
          lastAttempt: new Date(now - 30_000).toISOString(),
        },
        2: {
          status: 'maintenance',
          reason: 'maintenance',
          latencyMs: null,
          lastAttempt: new Date(now - 300_000).toISOString(),
        },
      }),
    } as never,
    { open: () => ({}) } as never,
    { current: () => null },
  );

  expect((await app.inject('/api/widget-sources/monitoring/availability')).statusCode).toBe(400);
  expect(
    (await app.inject('/api/widget-sources/monitoring/availability?target=Jellyfin&range=90d'))
      .statusCode,
  ).toBe(400);

  const serviceRes = await app.inject(
    '/api/widget-sources/monitoring/availability?target=Jellyfin&range=24h',
  );
  expect(serviceRes.statusCode).toBe(200);
  expect(serviceRes.json()).toMatchObject({
    range: '24h',
    target: {
      id: 1,
      name: 'Jellyfin',
      isService: true,
      state: 'ok',
      stale: false,
      uptimePct: 80,
      checks: 7,
      upChecks: 4,
      downChecks: 1,
      unknownChecks: 2,
      minChecks: 5,
    },
  });
  expect(serviceRes.json().target.buckets).toHaveLength(48);

  const probeRes = await app.inject(
    '/api/widget-sources/monitoring/availability?target=DNS%20Probe&range=7d',
  );
  expect(probeRes.statusCode).toBe(200);
  expect(probeRes.json()).toMatchObject({
    range: '7d',
    target: {
      id: 2,
      name: 'DNS Probe',
      isService: false,
      state: 'maintenance',
      stale: true,
      uptimePct: null,
      checks: 4,
      upChecks: 3,
      downChecks: 0,
      unknownChecks: 1,
      minChecks: 5,
    },
  });
  expect(probeRes.json().target.buckets).toHaveLength(84);

  const missingRes = await app.inject(
    '/api/widget-sources/monitoring/availability?target=Renamed&range=30d',
  );
  expect(missingRes.statusCode).toBe(200);
  expect(missingRes.json()).toMatchObject({ range: '30d', target: null });

  await app.close();
  db.close();
});

it('returns bounded maintenance with precise boundaries, scopes, ordering and no notes', async () => {
  const now = 1_800_000_000_000;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  const db = new DatabaseSync(':memory:');
  const app = Fastify();
  try {
    db.exec(`CREATE TABLE monitors(id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE services(id INTEGER, category TEXT);
      CREATE TABLE service_groups(id INTEGER, name TEXT, page_id INTEGER);
      CREATE TABLE pages(id INTEGER, name TEXT, position INTEGER);
      CREATE TABLE service_maintenance(id INTEGER, service_id INTEGER, starts_at INTEGER, ends_at INTEGER, note TEXT);
      INSERT INTO monitors VALUES(1,'A'),(2,'B'),(3,'Probe');
      INSERT INTO services VALUES(1,'Infra'),(2,'Media');
      INSERT INTO service_groups VALUES(1,'Infra',1),(2,'Media',2);
      INSERT INTO pages VALUES(1,'Home',0),(2,'Other',1);`);
    const insert = db.prepare('INSERT INTO service_maintenance VALUES(?,?,?,?,?)');
    insert.run(1, 1, now - 100000000, now + 1, 'secret note');
    insert.run(2, 2, now, now + 2000, 'secret note');
    insert.run(3, 1, now + 1000, now + 3000, 'secret note');
    insert.run(4, 3, now + 1000, now + 3000, 'secret note');
    insert.run(5, 1, now - 1000, now, 'ended');
    insert.run(6, 1, now + 86400000, now + 86401000, 'outside');
    registerWidgetMonitoringRoutes(
      app,
      db,
      { list: () => [] } as never,
      { snapshot: () => ({}) } as never,
      { open: () => ({}) } as never,
      { current: () => null },
    );
    const response = await app.inject('/api/widget-sources/monitoring/maintenance?days=1&limit=3');
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('secret');
    expect(response.json()).toMatchObject({ total: 4, items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(
      (await app.inject('/api/widget-sources/monitoring/maintenance?days=1')).json(),
    ).toMatchObject({
      total: 4,
      items: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4, hasService: false }],
    });
    const params = new URLSearchParams({
      days: '1',
      groups: JSON.stringify(['Infra']),
      pages: JSON.stringify(['Home']),
    });
    expect(
      (await app.inject(`/api/widget-sources/monitoring/maintenance?${params}`)).json(),
    ).toMatchObject({ total: 2, items: [{ id: 1 }, { id: 3 }] });
    params.set('groups', JSON.stringify(['Removed']));
    expect(
      (await app.inject(`/api/widget-sources/monitoring/maintenance?${params}`)).json(),
    ).toMatchObject({ total: 0, items: [] });
    expect(
      (await app.inject('/api/widget-sources/monitoring/maintenance?limit=11')).statusCode,
    ).toBe(400);
    expect((await app.inject('/api/widget-sources/monitoring/maintenance?days=2')).statusCode).toBe(
      400,
    );
    clock.mockReturnValue(now + 1);
    expect(
      (await app.inject('/api/widget-sources/monitoring/maintenance?days=1&limit=3')).json()
        .items[0].id,
    ).toBe(2);
    db.prepare('DELETE FROM monitors WHERE id=2').run();
    expect(
      (await app.inject('/api/widget-sources/monitoring/maintenance?days=1&limit=3'))
        .json()
        .items.some((item: { monitorId: number }) => item.monitorId === 2),
    ).toBe(false);
  } finally {
    await app.close();
    db.close();
    clock.mockRestore();
  }
});

it('reads latency by local service identity and reports a missing deleted selection', async () => {
  const now = Date.now();
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY);
    CREATE TABLE monitors(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE service_identities(service_id INTEGER PRIMARY KEY,identity TEXT);
    CREATE TABLE service_monitor_settings(service_id INTEGER,degraded_latency_ms INTEGER);
    INSERT INTO services VALUES(1); INSERT INTO monitors VALUES(1,'Server');
    INSERT INTO service_identities VALUES(1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');`);
  const app = Fastify();
  const targets = [
    { id: 1, name: 'Server', url: 'https://example.test', allowPrivate: false, checkInterval: 30 },
  ];
  const observations = {
    latency: () => ({
      points: [
        { start: now - 1000, p50: null },
        { start: now, p50: 12 },
      ],
    }),
    lastValidLatency: () => ({ observedAt: now - 1000, latencyMs: 12 }),
  };
  registerWidgetMonitoringRoutes(
    app,
    db,
    { list: () => targets } as never,
    {
      snapshot: () => ({
        1: {
          status: 'unavailable',
          reason: 'no-response',
          lastAttempt: new Date(now - 61_000).toISOString(),
        },
      }),
    } as never,
    { open: () => ({}) } as never,
    { current: () => null },
    undefined,
    undefined,
    observations as never,
  );
  try {
    expect((await app.inject('/api/widget-sources/monitoring/serviceTargets')).json()).toEqual([
      { target: 'a'.repeat(32), name: 'Server' },
    ]);
    const path = `/api/widget-sources/monitoring/latency?target=${'a'.repeat(32)}&range=24h`;
    expect((await app.inject(path)).json()).toMatchObject({
      target: {
        id: 1,
        state: 'down',
        stale: true,
        lastValid: { latencyMs: 12 },
        points: [{ p50: null }, { p50: 12 }],
      },
    });
    db.exec('DELETE FROM service_identities');
    expect((await app.inject(path)).json().target).toBeNull();
    expect((await app.inject('/api/widget-sources/monitoring/latency?target=1')).statusCode).toBe(
      400,
    );
  } finally {
    await app.close();
    db.close();
  }
});
