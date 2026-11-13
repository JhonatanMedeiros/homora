import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createObservationStore } from './service-observations.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.parse('2026-11-12T12:00:00.000Z');

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER,expected_status TEXT,check_path TEXT,check_match TEXT);
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,
      status TEXT GENERATED ALWAYS AS (json_extract(observation,'$.status')) VIRTUAL,
      latency_ms REAL GENERATED ALWAYS AS (json_extract(observation,'$.latencyMs')) VIRTUAL,
      UNIQUE(service_id,observed_at,signature));
    CREATE INDEX history_uptime_idx ON service_observation_history(service_id,signature,observed_at,status,latency_ms);
    INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(1,'https://one.test',0,'http',30),(2,'https://two.test',0,'http',30);`);
  const store = createObservationStore(db);
  // Publishing once records the configuration signature the service has right now.
  const service = (id: number) => ({
    id,
    name: 's',
    url: `https://${id === 1 ? 'one' : 'two'}.test`,
    category: 'c',
    description: '',
    icon: '',
    position: 0,
    allowPrivate: false,
    checkType: 'http' as const,
    checkInterval: 30,
  });
  store.publish([service(1), service(2)], {
    1: {
      status: 'unknown',
      lastAttempt: null,
      reason: 'unchecked',
      httpStatus: null,
      latencyMs: null,
    },
    2: {
      status: 'unknown',
      lastAttempt: null,
      reason: 'unchecked',
      httpStatus: null,
      latencyMs: null,
    },
  });
  const sig = (id: number) =>
    (
      db.prepare('SELECT signature FROM service_observations WHERE service_id=?').get(id) as {
        signature: string;
      }
    ).signature;
  const add = (
    id: number,
    ago: number,
    status: 'available' | 'unavailable' | 'unknown',
    latencyMs: number | null = null,
    signature = sig(id),
  ) =>
    db
      .prepare(
        'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
      )
      .run(id, signature, now - ago, JSON.stringify({ status, latencyMs, reason: 'responding' }));
  return { db, store, add };
}

it('computes uptime, latency and buckets that match a manual count', () => {
  const { db, store, add } = setup();
  try {
    // 20 checks: 18 up (10..180 ms), 2 down, plus 3 unknown that must not count.
    for (let i = 0; i < 18; i++) add(1, (i + 1) * 60_000, 'available', (i + 1) * 10);
    add(1, 20 * 60_000, 'unavailable');
    add(1, 21 * 60_000, 'unavailable');
    for (let i = 0; i < 3; i++) add(1, (30 + i) * 60_000, 'unknown');
    const summary = store.uptime('24h', now, 1)[1]!;
    expect(summary).toMatchObject({
      range: '24h',
      uptimePct: 90,
      checks: 23,
      downChecks: 2,
      unknownChecks: 3,
      lastLatencyMs: 10,
      p95LatencyMs: 180,
      reconfigured: false,
    });
    expect(summary.buckets).toHaveLength(48);
    expect(summary.buckets.at(-1)?.status).toBe('partial');
    expect(summary.buckets[0]?.status).toBe('unknown');
  } finally {
    db.close();
  }
});

it('gives every bucket its mean latency and the reason of its last failure', () => {
  const { db, store, add } = setup();
  try {
    const failure = (ago: number, reason: string, httpStatus: number | null) =>
      db
        .prepare(
          'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(1,(SELECT signature FROM service_observations WHERE service_id=1),?,?)',
        )
        .run(
          now - ago,
          JSON.stringify({ status: 'unavailable', latencyMs: null, reason, httpStatus }),
        );
    // Same 30-minute bucket: two successes (100 and 300 ms), then two failures; the later one wins.
    add(1, 4 * 60_000, 'available', 100);
    add(1, 3 * 60_000, 'available', 300);
    failure(2 * 60_000, 'no-response', null);
    failure(1 * 60_000, 'error-status', 502);
    // An older, healthy bucket carries no failure detail.
    add(1, 3 * 3_600_000, 'available', 50);
    const { buckets } = store.uptime('24h', now, 1)[1]!;
    expect(buckets.at(-1)).toMatchObject({
      status: 'partial',
      checks: 4,
      avgLatencyMs: 200,
      reason: 'error-status',
      httpStatus: 502,
    });
    const healthy = buckets.find((bucket) => bucket.status === 'up');
    expect(healthy).toMatchObject({ checks: 1, avgLatencyMs: 50 });
    expect(healthy).not.toHaveProperty('reason');
    expect(buckets[0]).toMatchObject({ status: 'unknown', checks: 0, avgLatencyMs: null });
  } finally {
    db.close();
  }
});

it('keeps unknown out of the denominator and reports no percentage without enough checks', () => {
  const { db, store, add } = setup();
  try {
    for (let i = 0; i < 4; i++) add(1, (i + 1) * 60_000, 'available', 5);
    expect(store.uptime('24h', now)[1]?.uptimePct).toBeNull();
    add(1, 10 * 60_000, 'available', 5);
    for (let i = 0; i < 50; i++) add(1, (20 + i) * 60_000, 'unknown');
    expect(store.uptime('24h', now)[1]?.uptimePct).toBe(100);
    // No history at all: null, never 100.
    expect(store.uptime('24h', now, 2)[2]).toMatchObject({
      uptimePct: null,
      checks: 0,
      lastLatencyMs: null,
      p95LatencyMs: null,
    });
  } finally {
    db.close();
  }
});

it('ignores checks from an older configuration and flags it', () => {
  const { db, store, add } = setup();
  try {
    for (let i = 0; i < 6; i++) add(1, (i + 1) * 60_000, 'unavailable', null, 'previous');
    for (let i = 0; i < 5; i++) add(1, (10 + i) * 60_000, 'available', 7);
    expect(store.uptime('24h', now, 1)[1]).toMatchObject({
      uptimePct: 100,
      checks: 5,
      reconfigured: true,
    });
  } finally {
    db.close();
  }
});

it('excludes records past the thirty-day retention and sizes buckets per range', () => {
  const { db, store, add } = setup();
  try {
    for (let i = 0; i < 5; i++) add(1, 31 * DAY + i, 'unavailable');
    for (let i = 0; i < 5; i++) add(1, 29 * DAY + i * HOUR, 'available', 1);
    const monthly = store.uptime('30d', now, 1)[1]!;
    expect(monthly).toMatchObject({ uptimePct: 100, checks: 5, downChecks: 0 });
    expect(monthly.buckets).toHaveLength(120);
    expect(store.uptime('7d', now, 1)[1]?.buckets).toHaveLength(84);
    expect(store.uptime('7d', now, 1)[1]?.checks).toBe(0);
  } finally {
    db.close();
  }
});

it('gives the same numbers for one service and for the batch', () => {
  const { db, store, add } = setup();
  try {
    for (let i = 0; i < 12; i++) {
      add(1, (i + 1) * 5 * 60_000, i % 4 ? 'available' : 'unavailable', 20 + i);
      add(2, (i + 1) * 5 * 60_000, 'available', 90 - i);
    }
    const all = store.uptime('7d', now);
    // Same numbers; only the single-service call adds the percentile.
    const { p95LatencyMs, ...single } = store.uptime('7d', now, 1)[1]!;
    expect(p95LatencyMs).toBe(31);
    expect(all[1]).toEqual(single);
    expect(all[1]).not.toHaveProperty('p95LatencyMs');
    expect(store.uptime('7d', now, 99)).toEqual({});
  } finally {
    db.close();
  }
});

it('answers 25 services with 30 days of history at the default 60 s interval within the budget', () => {
  const { db, store } = setup();
  const SERVICES = 25,
    PER_SERVICE = 43_200; // one check per minute for 30 days
  try {
    db.exec('BEGIN');
    const sig = (
      db.prepare('SELECT signature FROM service_observations WHERE service_id=1').get() as {
        signature: string;
      }
    ).signature;
    expect(sig).toHaveLength(16);
    const insertService = db.prepare(
      "INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(?,'https://one.test',0,'http',30)",
    );
    for (let id = 3; id <= SERVICES; id++) insertService.run(id);
    // Generate the representative history inside SQLite instead of crossing the JS/SQLite
    // boundary once per row. This test measures the uptime query, not fixture insertion.
    db.prepare(
      `WITH RECURSIVE checks(i) AS (
        VALUES(0)
        UNION ALL SELECT i + 1 FROM checks WHERE i + 1 < ?
      )
      INSERT INTO service_observation_history(service_id,signature,observed_at,observation)
      SELECT services.id, ?, ? - checks.i * 60000,
        json_object(
          'status', CASE WHEN checks.i % 50 = 0 THEN 'unavailable' ELSE 'available' END,
          'latencyMs', checks.i % 300
        )
      FROM services CROSS JOIN checks
      WHERE services.id <= ?`,
    ).run(PER_SERVICE, sig, now, SERVICES);
    db.exec('COMMIT');
    const timings: Record<string, number> = {};
    for (const range of ['24h', '7d', '30d'] as const) {
      const started = performance.now();
      const all = store.uptime(range, now);
      timings[range] = Math.round(performance.now() - started);
      expect(Object.keys(all)).toHaveLength(SERVICES);
      expect(all[1]?.checks).toBe({ '24h': 1441, '7d': 10_081, '30d': 43_200 }[range]);
    }
    console.info(`uptime for ${SERVICES} services x 30d at 60 s (ms): ${JSON.stringify(timings)}`);
    // The default period meets the 300 ms goal with margin; the longer ones scan more rows.
    expect(timings['24h']).toBeLessThan(300);
    // Budgets include the per-period latency and failure reason behind the history bars (about
    // 25% over the bare counts) and leave room for the load of the whole suite running in parallel.
    expect(timings['7d']).toBeLessThan(450);
    expect(timings['30d']).toBeLessThan(1500);
  } finally {
    db.close();
  }
}, 30000);
