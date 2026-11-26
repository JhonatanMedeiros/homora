import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it } from 'vitest';
import { CARD_SCHEMA } from '../test-card-schema.js';
import { createMonitoringSource } from './service-source.js';
import { createObservationStore } from './observations.js';
import { monitoringCoverage } from './coverage.js';

let db: DatabaseSync;
const now = Date.parse('2026-11-11T12:00:00Z');
function setup() {
  db = new DatabaseSync(':memory:');
  db.exec(`${CARD_SCHEMA}
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,UNIQUE(service_id,observed_at,signature));`);
  return db;
}
afterEach(() => db?.close());

it('distinguishes missing targets, blocked checks, maintenance, stale and unavailable data without false positives', () => {
  setup();
  const insert = db.prepare(
    'INSERT INTO service_cards(id,url,allow_private,check_interval) VALUES(?,?,0,?)',
  );
  for (let id = 1; id <= 7; id++)
    insert.run(id, id === 1 ? '' : 'https://example.test', id === 7 ? null : 30);
  db.exec("INSERT INTO monitors(id,name,check_url) VALUES(8,'Probe','https://example.test')");
  const source = createMonitoringSource(db).list();
  const state = (reason: 'responding' | 'destination-blocked' | 'maintenance', age: number) => ({
    status:
      reason === 'responding'
        ? ('available' as const)
        : reason === 'maintenance'
          ? ('unknown' as const)
          : ('unavailable' as const),
    reason,
    lastAttempt: new Date(now - age).toISOString(),
    httpStatus: null,
    latencyMs: null,
  });
  createObservationStore(db).publish(source, {
    2: state('destination-blocked', 1_000),
    3: state('maintenance', 1_000),
    4: state('responding', 60_001),
    6: state('responding', 60_000),
    7: state('responding', 119_000),
    8: state('responding', 1_000),
  });
  const result = monitoringCoverage(db, now);
  expect(result.total).toBe(8);
  expect(result.items.map(({ id, reason }) => [id, reason])).toEqual([
    [1, 'missing-target'],
    [2, 'blocked'],
    [3, 'maintenance'],
    [4, 'stale'],
    [5, 'unknown'],
  ]);
  expect(result.items[0]?.link).toBe('/manage/services/1/edit');
  db.prepare('UPDATE service_observations SET observation=? WHERE service_id=2').run('{bad');
  expect(monitoringCoverage(db, now).items.find((item) => item.id === 2)?.reason).toBe('unknown');
});

it('handles empty inventories and bounds the result without revealing addresses', () => {
  setup();
  expect(monitoringCoverage(db, now)).toMatchObject({ total: 0, items: [], truncated: false });
  const insert = db.prepare('INSERT INTO monitors(id,name,check_url) VALUES(?,?,?)');
  for (let id = 1; id <= 101; id++) insert.run(id, 'secret name', 'https://secret.example');
  const result = monitoringCoverage(db, now);
  expect(result).toMatchObject({ total: 101, truncated: true });
  expect(result.items).toHaveLength(100);
  expect(result.items[0]).toMatchObject({
    kind: 'probe',
    link: '/manage/probes',
    reason: 'unknown',
  });
  expect(JSON.stringify(result)).not.toContain('secret');
});
