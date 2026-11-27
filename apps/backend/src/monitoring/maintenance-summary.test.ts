import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { CARD_SCHEMA } from '../test-card-schema.js';
import { createMonitoringSource } from './service-source.js';
import { createObservationStore } from './observations.js';
import { maintenanceSummary } from './maintenance-summary.js';

it('only reports a fresh current-configuration observation after the window', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`${CARD_SCHEMA}
    CREATE TABLE service_observations(service_id INTEGER PRIMARY KEY,signature TEXT,observation TEXT);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,UNIQUE(service_id,observed_at,signature));
    CREATE TABLE service_maintenance(id INTEGER PRIMARY KEY,service_id INTEGER,ends_at INTEGER);
    INSERT INTO service_cards(id,url,check_interval) VALUES(1,'https://example.test',30);
    INSERT INTO service_maintenance VALUES(1,1,1000000),(2,1,1100000);`);
  const now = 1_050_000;
  try {
    const store = createObservationStore(db);
    const services = createMonitoringSource(db).list();
    const publish = (at: number, status: 'available' | 'unavailable' | 'unknown') =>
      store.publish(services, {
        1: {
          status,
          reason:
            status === 'unknown'
              ? 'maintenance'
              : status === 'available'
                ? 'responding'
                : 'no-response',
          lastAttempt: new Date(at).toISOString(),
          httpStatus: null,
          latencyMs: null,
        },
      });
    expect(maintenanceSummary(db, 1, 2, now)?.state).toBe('pending');
    expect(maintenanceSummary(db, 1, 99, now)).toBeNull();
    expect(maintenanceSummary(db, 2, 1, now)).toBeNull();
    expect(maintenanceSummary(db, 1, 1, now)?.state).toBe('insufficient');
    publish(now - 55_000, 'available');
    expect(maintenanceSummary(db, 1, 1, now)?.state).toBe('insufficient');
    publish(now - 30_000, 'unavailable');
    expect(maintenanceSummary(db, 1, 1, now)?.state).toBe('unavailable');
    publish(now - 20_000, 'available');
    expect(maintenanceSummary(db, 1, 1, now)?.state).toBe('available');
    expect(maintenanceSummary(db, 1, 1, now + 45_000)?.state).toBe('insufficient');
    db.prepare("UPDATE services SET url='https://changed.test' WHERE id=1").run();
    expect(maintenanceSummary(db, 1, 1, now)?.state).toBe('insufficient');
  } finally {
    db.close();
  }
});
