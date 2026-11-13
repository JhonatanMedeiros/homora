import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createObservationStore } from './observations.js';
import { createRollupStore } from './rollup.js';
import { serviceSignature } from './signature.js';
import type { ServiceStatus } from './monitor.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const schema = `CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER,expected_status TEXT,check_path TEXT,check_match TEXT);
  CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER);
  INSERT INTO config_version VALUES(1,1);
  CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
  CREATE TABLE service_uptime_rollup(service_id INTEGER NOT NULL,hour INTEGER NOT NULL,up INTEGER NOT NULL DEFAULT 0,down INTEGER NOT NULL DEFAULT 0,unknown INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(service_id,hour));
  CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,status TEXT GENERATED ALWAYS AS (json_extract(observation,'$.status')) VIRTUAL,latency_ms REAL GENERATED ALWAYS AS (json_extract(observation,'$.latencyMs')) VIRTUAL,UNIQUE(service_id,observed_at,signature));`;
const service = {
  id: 1,
  name: 'S',
  url: 'https://s.test',
  category: 'Home',
  description: '',
  icon: '',
  position: 1,
  allowPrivate: false,
  checkType: 'http' as const,
  checkInterval: 30,
};
const state = (at: number, status: ServiceStatus['status'], latency = 10): ServiceStatus => ({
  status,
  lastAttempt: new Date(at).toISOString(),
  reason: status === 'available' ? 'responding' : 'error-status',
  httpStatus: status === 'available' ? 200 : 502,
  latencyMs: status === 'available' ? latency : null,
});
function open() {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  db.prepare(
    "INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(1,'https://s.test',0,'http',30)",
  ).run();
  const rollup = createRollupStore(db);
  return { db, rollup, store: createObservationStore(db, rollup) };
}
const hourStart = Math.floor(Date.now() / HOUR) * HOUR;

describe('uptime rollup', () => {
  it('counts every new check once per hour, however often a state is published', () => {
    const { rollup, store } = open();
    const at = hourStart - 5 * 60_000;
    store.publish([service], { 1: state(at, 'available') });
    store.publish([service], { 1: state(at, 'available') });
    store.publish([service], { 1: state(at + 1000, 'unavailable') });
    store.publish([service], { 1: state(at + 2000, 'unknown') });
    expect(rollup.hourly(1, hourStart - HOUR, hourStart)).toEqual([
      { hour: hourStart - HOUR, up: 1, down: 1, unknown: 1 },
    ]);
  });

  it('backfills from the stored history only when empty', () => {
    const { db, rollup } = open();
    const sig = serviceSignature(service);
    const add = (at: number, status: string) =>
      db
        .prepare(
          'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(1,?,?,?)',
        )
        .run(sig, at, JSON.stringify({ status, latencyMs: 5 }));
    add(hourStart - 2 * HOUR + 1, 'available');
    add(hourStart - 2 * HOUR + 2, 'unavailable');
    add(hourStart - HOUR + 1, 'available');
    expect(rollup.backfill()).toBe(2);
    expect(rollup.backfill()).toBe(0);
    expect(rollup.hourly(1, hourStart - 3 * HOUR, hourStart)).toEqual([
      { hour: hourStart - 2 * HOUR, up: 1, down: 1, unknown: 0 },
      { hour: hourStart - HOUR, up: 1, down: 0, unknown: 0 },
    ]);
  });

  it('compares a period with the one before it and drops rows older than the retention', () => {
    const { db, rollup, store } = open();
    const put = (hour: number, up: number, down: number) =>
      db
        .prepare('INSERT INTO service_uptime_rollup(service_id,hour,up,down) VALUES(1,?,?,?)')
        .run(hour, up, down);
    put(hourStart - 30 * HOUR, 90, 10); // previous 24 h: 90 %
    put(hourStart - 2 * HOUR, 99, 1);
    const summary = store.uptime('24h', hourStart + 30 * 60_000, 1)[1];
    expect(summary?.previousUptimePct).toBe(90);
    expect(store.uptime('7d', hourStart, 1)[1]?.previousUptimePct).toBeNull();
    put(hourStart - 120 * DAY, 1, 0);
    rollup.prune(hourStart);
    expect(rollup.hourly(1, hourStart - 130 * DAY, hourStart - 110 * DAY)).toEqual([]);
  });
});

describe('latency and insights', () => {
  it('gives the median and 95th percentile of each slot and of the whole range', () => {
    const { store } = open();
    const now = Date.now();
    // Ten successful checks inside one 30-minute slot: 10, 20 … 100 ms.
    for (let i = 1; i <= 10; i++)
      store.publish([service], { 1: state(now - 60_000 * (11 - i), 'available', i * 10) });
    const series = store.latency(1, '24h', now);
    expect(series.points).toHaveLength(48);
    expect(series.p50).toBe(50);
    expect(series.p95).toBe(100);
    expect(series.max).toBe(100);
    expect(
      series.points.filter((point) => point.checks > 0).reduce((n, p) => n + p.checks, 0),
    ).toBe(10);
    expect(() => store.latency(9, '24h', now)).toThrow('Service not found');
  });

  it('lists why checks failed and the latest checks', () => {
    const { store } = open();
    const now = Date.now();
    store.publish([service], { 1: state(now - 3000, 'unavailable') });
    store.publish([service], { 1: state(now - 2000, 'unavailable') });
    store.publish([service], { 1: state(now - 1000, 'available') });
    const insights = store.insights(1, now);
    expect(insights.reasons).toEqual([{ reason: 'error-status', httpStatus: 502, count: 2 }]);
    expect(insights.recent.map((check) => check.status)).toEqual([
      'available',
      'unavailable',
      'unavailable',
    ]);
    expect(insights.heat.reduce((n, row) => n + row.up + row.down, 0)).toBe(3);
  });
});
