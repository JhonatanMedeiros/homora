import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createObservationStore } from './service-observations.js';

it('shares only current observations and treats stale, changed or malformed data as unknown', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,url TEXT,allow_private INTEGER,check_type TEXT,check_interval INTEGER);
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    INSERT INTO services VALUES(1,'https://example.test',0,'http',30);`);
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
