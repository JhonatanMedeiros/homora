import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createInbox } from './inbox.js';
import { createIncidentStore, serviceSignature } from './monitoring/index.js';
import { CARD_SCHEMA } from './test-card-schema.js';
import type { Service } from '@homora/shared';
import type { ServiceStatus } from './monitoring/index.js';

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON; ${CARD_SCHEMA}
    INSERT INTO service_cards(id,name) VALUES(1,'Example');
    INSERT INTO monitors(id,name) VALUES(2,'Probe');
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE service_monitor_settings(service_id INTEGER PRIMARY KEY,failure_threshold INTEGER NOT NULL,recovery_threshold INTEGER NOT NULL,degraded_latency_ms INTEGER);
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,service_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,started_at INTEGER NOT NULL,ended_at INTEGER,reason TEXT NOT NULL,http_status INTEGER,failed_checks INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE inbox_notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,service_id INTEGER REFERENCES monitors(id) ON DELETE SET NULL,incident_id INTEGER REFERENCES service_incidents(id) ON DELETE SET NULL,kind TEXT NOT NULL,service_name TEXT NOT NULL,confirmed_at INTEGER NOT NULL,started_at INTEGER NOT NULL,ended_at INTEGER,reason TEXT,http_status INTEGER,read_at INTEGER,UNIQUE(incident_id,kind));`);
  const inbox = createInbox(db);
  return { db, inbox, store: createIncidentStore(db, inbox.record) };
}
const service = { id: 1 } as Service;
const now = Date.now();
function state(status: ServiceStatus['status'], minute: number): ServiceStatus {
  return {
    status,
    lastAttempt: new Date(now + minute * 60_000).toISOString(),
    reason: status === 'available' ? 'responding' : 'no-response',
    httpStatus: null,
    latencyMs: null,
  };
}

describe('inbox incident events', () => {
  it('records threshold transitions once, survives restart and keeps history after deletion', () => {
    const { db, inbox, store } = setup();
    store.setSettings(1, { failureThreshold: 2, recoveryThreshold: 2, degradedLatencyMs: null });
    const feed = (status: ServiceStatus['status'], minute: number) =>
      store.observe([service], { 1: state(status, minute) });
    feed('unavailable', 0);
    expect(inbox.list(20).unread).toBe(0);
    feed('unavailable', 1);
    feed('unavailable', 2);
    feed('available', 3);
    expect(inbox.list(20).unread).toBe(1);
    const restarted = createIncidentStore(db, inbox.record);
    restarted.observe([service], { 1: state('available', 4) });
    restarted.observe([service], { 1: state('available', 5) });
    expect(inbox.list(20).items.map((row) => row.kind)).toEqual(['up', 'down']);
    const down = inbox.list(20).items[1];
    expect(inbox.read(Number(down.id))).toBe(true);
    expect(inbox.list(20).unread).toBe(1);
    inbox.readAll();
    expect(inbox.list(20).unread).toBe(0);
    db.prepare('DELETE FROM monitors WHERE id=1').run();
    expect(inbox.list(20).items).toHaveLength(2);
    expect(inbox.list(20).items[0]).toMatchObject({ serviceId: null, serviceName: 'Example' });
  });
  it('records probes and flags them, and rolls back incident when notification storage fails', () => {
    const { db, inbox, store } = setup();
    store.observe([{ id: 2 } as Service], { 2: state('unavailable', 0) });
    expect(inbox.list(20).items).toMatchObject([
      { serviceId: 2, serviceName: 'Probe', probe: true },
    ]);
    db.exec('DELETE FROM inbox_notifications');
    db.exec(
      "CREATE TRIGGER fail_inbox BEFORE INSERT ON inbox_notifications BEGIN SELECT RAISE(ABORT, 'failure'); END;",
    );
    expect(() => store.observe([service], { 1: state('unavailable', 1) })).toThrow();
    expect(
      db.prepare('SELECT count(*) AS n FROM service_incidents WHERE service_id=1').get(),
    ).toEqual({ n: 0 });
  });
});

it('paginates by confirmation time and prunes expired and excess unread records', () => {
  const { db, inbox } = setup();
  const insert = db.prepare(
    "INSERT INTO inbox_notifications(kind,service_name,confirmed_at,started_at) VALUES('down','Example',?,?)",
  );
  insert.run(now - 91 * 24 * 60 * 60_000, now);
  db.exec('BEGIN');
  for (let i = 0; i < 10_002; i++) insert.run(now + i, now);
  db.exec('COMMIT');
  inbox.prune(now);
  expect(inbox.list(2).unread).toBe(10_000);
  const first = inbox.list(2);
  expect(first.items.map((item) => item.confirmedAt)).toEqual([now + 10_001, now + 10_000]);
  const second = inbox.list(2, Number(first.nextBefore));
  expect(second.items.map((item) => item.confirmedAt)).toEqual([now + 9_999, now + 9_998]);
  inbox.readAll();
  insert.run(now + 20_000, now);
  expect(inbox.list(1).unread).toBe(1);
});

it('does not create events when incidents are rebuilt from earlier history', () => {
  const { db, inbox, store } = setup();
  db.exec(`CREATE TABLE service_observation_history(service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,
    status TEXT GENERATED ALWAYS AS (json_extract(observation,'$.status')) VIRTUAL);`);
  db.prepare(
    'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
  ).run(
    1,
    serviceSignature(service),
    now,
    JSON.stringify({ status: 'unavailable', reason: 'no-response' }),
  );
  expect(store.rebuildFromHistory([service])).toBe(1);
  expect(inbox.list(20).items).toEqual([]);
  store.observe([service], { 1: state('available', 1) });
  expect(inbox.list(20).items.map((item) => item.kind)).toEqual(['up']);
});

it('records successive outages within the outbound cooldown and ignores unknown checks', () => {
  const { inbox, store } = setup();
  store.setSettings(1, { failureThreshold: 2, recoveryThreshold: 1, degradedLatencyMs: null });
  const feed = (status: ServiceStatus['status'], minute: number) =>
    store.observe([service], { 1: state(status, minute) });
  feed('unavailable', 0);
  feed('unknown', 1);
  feed('unavailable', 2);
  feed('available', 3);
  feed('unavailable', 4);
  feed('unavailable', 5);
  feed('available', 6);
  expect(inbox.list(20).items.map((item) => item.kind)).toEqual(['up', 'down', 'up', 'down']);
});
