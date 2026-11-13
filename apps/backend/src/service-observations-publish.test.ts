import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createObservationStore } from './service-observations.js';
import type { ServiceStatus } from './service-monitor.js';

const schema = `CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER,expected_status TEXT,check_path TEXT,check_match TEXT);
  CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER);
  INSERT INTO config_version VALUES(1,1);
  CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
  CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,status TEXT GENERATED ALWAYS AS (json_extract(observation,'$.status')) VIRTUAL,latency_ms REAL GENERATED ALWAYS AS (json_extract(observation,'$.latencyMs')) VIRTUAL,UNIQUE(service_id,observed_at,signature));`;
const service = (id: number) => ({
  id,
  name: `S${id}`,
  url: `https://s${id}.test`,
  category: 'Home',
  description: '',
  icon: '',
  position: id,
  allowPrivate: false,
  checkType: 'http' as const,
  checkInterval: 30,
});
const state = (at: number, status: ServiceStatus['status'] = 'available'): ServiceStatus => ({
  status,
  lastAttempt: new Date(at).toISOString(),
  reason: status === 'available' ? 'responding' : 'no-response',
  httpStatus: status === 'available' ? 200 : null,
  latencyMs: status === 'available' ? 10 : null,
});
const open = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(schema);
  for (const id of [1, 2, 3])
    db.prepare(
      "INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(?,?,0,'http',30)",
    ).run(id, `https://s${id}.test`);
  return db;
};
const count = (db: DatabaseSync, table: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('observation publishing', () => {
  it('writes only rows that changed and removes rows of services that disappeared', () => {
    const db = open();
    try {
      const store = createObservationStore(db);
      const now = Date.now() - 1000;
      const services = [service(1), service(2), service(3)];
      store.publish(services, { 1: state(now), 2: state(now), 3: state(now) });
      expect(count(db, 'service_observations')).toBe(3);
      expect(count(db, 'service_observation_history')).toBe(3);
      // Same snapshot again: nothing new.
      store.publish(services, { 1: state(now), 2: state(now), 3: state(now) });
      expect(count(db, 'service_observation_history')).toBe(3);
      // Only service 2 has a new check.
      store.publish(services, { 1: state(now), 2: state(now + 500, 'unavailable'), 3: state(now) });
      expect(count(db, 'service_observation_history')).toBe(4);
      expect(
        db.prepare('SELECT observation FROM service_observations WHERE service_id=2').get(),
      ).toMatchObject({ observation: expect.stringContaining('unavailable') as string });
      // Service 3 was deleted.
      store.publish([service(1), service(2)], {
        1: state(now),
        2: state(now + 500, 'unavailable'),
      });
      expect(count(db, 'service_observations')).toBe(2);
    } finally {
      db.close();
    }
  });

  it('rewrites everything after clear() even if the process remembered the previous rows', () => {
    const db = open();
    try {
      const store = createObservationStore(db);
      const now = Date.now() - 1000;
      store.publish([service(1)], { 1: state(now) });
      store.clear();
      expect(count(db, 'service_observations')).toBe(0);
      store.publish([service(1)], { 1: state(now) });
      expect(count(db, 'service_observations')).toBe(1);
    } finally {
      db.close();
    }
  });
});

describe('cached uptime', () => {
  it('shares one computation, serves the cache, and recomputes after a configuration change', async () => {
    const db = open();
    try {
      const store = createObservationStore(db);
      const now = Date.now();
      store.publish([service(1)], { 1: state(now - 1000) });
      const [a, b] = await Promise.all([
        store.uptimeBody('24h', now),
        store.uptimeBody('24h', now),
      ]);
      expect(b).toBe(a);
      expect(JSON.parse(a.toString())).toEqual(store.uptime('24h', now));
      // New history arrives but the cached answer is still fresh.
      db.prepare(
        'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(1,\'x\',?,\'{"status":"available","latencyMs":1}\')',
      ).run(now - 500);
      expect(await store.uptimeBody('24h', now + 1000)).toBe(a);
      // After the TTL it is recomputed.
      expect(await store.uptimeBody('24h', now + 11_000)).not.toBe(a);
      // A configuration change drops it at once.
      db.prepare('UPDATE config_version SET version=version+1').run();
      db.prepare('DELETE FROM services WHERE id=1').run();
      expect(
        Object.keys(JSON.parse((await store.uptimeBody('24h', now + 1500)).toString()) as object),
      ).toEqual(['2', '3']);
    } finally {
      db.close();
    }
  });
});
