import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createObservationStore } from './observations.js';

it('shares only current observations and treats stale, changed or malformed data as unknown', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER,expected_status TEXT,check_path TEXT,check_url TEXT,check_match TEXT);
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,UNIQUE(service_id,observed_at,signature));
    INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(1,'https://example.test',0,'http',30);`);
  try {
    const store = createObservationStore(db);
    const service = {
      id: 1,
      name: 'Example',
      url: 'https://example.test',
      category: 'Home',
      description: '',
      icon: '',
      position: 0,
      allowPrivate: false,
      checkType: 'http' as const,
      checkInterval: 30,
    };
    const now = Date.parse('2026-11-11T00:00:00.000Z');
    const state = {
      status: 'available' as const,
      lastAttempt: new Date(now).toISOString(),
      reason: 'responding' as const,
      httpStatus: 200,
      latencyMs: 12,
    };
    store.publish([service], { 1: state });
    expect(store.list(now)).toEqual([{ id: 1, ...state, stale: false }]);
    expect(store.list(now + 91_000)[0]).toMatchObject({
      status: 'unknown',
      reason: 'unchecked',
      lastAttempt: state.lastAttempt,
      stale: true,
    });
    db.prepare("UPDATE services SET url='https://other.test' WHERE id=1").run();
    expect(store.list(now)[0]).toMatchObject({
      status: 'unknown',
      reason: 'unchecked',
      lastAttempt: null,
      stale: false,
    });
    db.prepare("UPDATE services SET url='https://example.test' WHERE id=1").run();
    db.prepare("UPDATE service_observations SET observation='{bad' WHERE service_id=1").run();
    expect(store.list(now)[0]).toMatchObject({ status: 'unknown', reason: 'unchecked' });
    store.clear();
    expect(db.prepare('SELECT * FROM service_observations').all()).toEqual([]);
  } finally {
    db.close();
  }
});

it('retains unique observations for thirty days and filters the requested window', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER,expected_status TEXT,check_path TEXT,check_url TEXT,check_match TEXT);
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,UNIQUE(service_id,observed_at,signature));
    INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(1,'https://example.test',0,'http',30);`);
  try {
    const store = createObservationStore(db);
    const service = {
      id: 1,
      name: 'Example',
      url: 'https://example.test',
      category: 'Home',
      description: '',
      icon: '',
      position: 0,
      allowPrivate: false,
      checkType: 'http' as const,
      checkInterval: 30,
    };
    const now = Date.now();
    const state = {
      status: 'available' as const,
      lastAttempt: new Date(now - 2000).toISOString(),
      reason: 'responding' as const,
      httpStatus: 200,
      latencyMs: 12,
    };
    db.prepare(
      'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
    ).run(1, 'old', now - 31 * 86400000, JSON.stringify(state));
    store.publish([service], { 1: state });
    store.publish([service], { 1: state });
    expect(store.history(1, now - 3000, now).events).toHaveLength(1);
    expect(store.history(1, now - 1000, now).events).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM service_observation_history').get()).toEqual({
      count: 1,
    });
    store.clear();
    expect(store.history(1, 0, now).events).toHaveLength(1);
  } finally {
    db.close();
  }
});

it('summarizes failure details: recent checks, outage start and last success', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER,expected_status TEXT,check_path TEXT,check_url TEXT,check_match TEXT);
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,UNIQUE(service_id,observed_at,signature));
    INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(1,'https://example.test',0,'http',30);`);
  try {
    const store = createObservationStore(db);
    const now = Date.now();
    const add = (minutesAgo: number, up: boolean) => {
      const observedAt = now - minutesAgo * 60_000;
      const observation = up
        ? { status: 'available', reason: 'responding', httpStatus: 200, latencyMs: 40 }
        : { status: 'unavailable', reason: 'no-response', httpStatus: null, latencyMs: null };
      db.prepare(
        'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
      ).run(
        1,
        'sig',
        observedAt,
        JSON.stringify({ ...observation, lastAttempt: new Date(observedAt).toISOString() }),
      );
    };
    expect(store.detail(1, now)).toMatchObject({
      recent: [],
      failingSince: null,
      lastSuccess: null,
    });
    add(5, true);
    add(4, true);
    expect(store.detail(1, now)).toMatchObject({ failingSince: null });
    add(3, false);
    add(2, false);
    add(1, false);
    const detail = store.detail(1, now);
    expect(detail.recent.map((event) => event.status)).toEqual([
      'available',
      'available',
      'unavailable',
      'unavailable',
      'unavailable',
    ]);
    expect(detail.failingSince).toBe(now - 3 * 60_000);
    expect(detail.failingSinceIsApproximate).toBe(false);
    expect(detail.lastSuccess).toEqual({ observedAt: now - 4 * 60_000, latencyMs: 40 });
    expect(Object.keys(detail.recent[0] ?? {}).sort()).toEqual([
      'httpStatus',
      'latencyMs',
      'observedAt',
      'reason',
      'status',
    ]);
    expect(() => store.detail(99, now)).toThrow('Service not found');
  } finally {
    db.close();
  }
});

it('marks the outage start as approximate when every read check failed', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER,expected_status TEXT,check_path TEXT,check_url TEXT,check_match TEXT);
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,UNIQUE(service_id,observed_at,signature));
    INSERT INTO services(id,url,allow_private,check_type,check_interval) VALUES(1,'https://example.test',0,'http',30);`);
  try {
    const store = createObservationStore(db);
    const now = Date.now();
    db.prepare(
      'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
    ).run(
      1,
      'sig',
      now - 1000,
      JSON.stringify({
        status: 'unavailable',
        reason: 'no-response',
        httpStatus: null,
        latencyMs: null,
        lastAttempt: new Date(now - 1000).toISOString(),
      }),
    );
    const detail = store.detail(1, now);
    expect(detail.failingSince).toBe(now - 1000);
    expect(detail.failingSinceIsApproximate).toBe(true);
    expect(detail.lastSuccess).toBeNull();
  } finally {
    db.close();
  }
});
