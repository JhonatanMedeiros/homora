import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Service, UptimeSummary } from '@homora/shared';
import type { ServiceStatus } from './monitor.js';
import { serviceSignature } from './signature.js';
import { createIncidentStore } from './incidents.js';
import { createMeasurementGuard } from './measurement.js';
import { CARD_SCHEMA } from '../test-card-schema.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const t0 = Date.parse('2026-11-12T12:00:00.000Z');

const service = {
  id: 1,
  name: 'Example',
  url: 'https://example.test',
  category: 'c',
  description: '',
  icon: '',
  position: 0,
  allowPrivate: false,
  checkType: 'http',
  checkInterval: 60,
} as Service;

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`${CARD_SCHEMA}
    INSERT INTO service_cards(id) VALUES(1),(2);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE service_monitor_settings(service_id INTEGER PRIMARY KEY,failure_threshold INTEGER NOT NULL DEFAULT 1,recovery_threshold INTEGER NOT NULL DEFAULT 1,degraded_latency_ms INTEGER);
    CREATE TABLE service_incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,service_id INTEGER NOT NULL,started_at INTEGER NOT NULL,ended_at INTEGER,reason TEXT NOT NULL,http_status INTEGER,failed_checks INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE service_observation_history(id INTEGER PRIMARY KEY,service_id INTEGER,signature TEXT,observed_at INTEGER,observation TEXT,
      status TEXT GENERATED ALWAYS AS (json_extract(observation,'$.status')) VIRTUAL,
      latency_ms REAL GENERATED ALWAYS AS (json_extract(observation,'$.latencyMs')) VIRTUAL);`);
  return { db, store: createIncidentStore(db) };
}

function state(
  status: ServiceStatus['status'],
  minute: number,
  reason: ServiceStatus['reason'] = status === 'available' ? 'responding' : 'error-status',
  httpStatus: number | null = status === 'unavailable' ? 502 : 200,
): ServiceStatus {
  return {
    status,
    lastAttempt: new Date(t0 + minute * MIN).toISOString(),
    reason,
    httpStatus,
    latencyMs: status === 'available' ? 40 : null,
  };
}

describe('incidents', () => {
  it('returns only the requested monitor incident', () => {
    const { db, store } = setup();
    try {
      db.prepare(
        'INSERT INTO service_incidents(id,service_id,started_at,reason) VALUES(?,?,?,?)',
      ).run(9, 1, t0, 'no-response');
      expect(store.find(1, 9)).toMatchObject({ id: 9, serviceId: 1, startedAt: t0 });
      expect(store.find(2, 9)).toBeNull();
      expect(store.find(1, 10)).toBeNull();
    } finally {
      db.close();
    }
  });
  it('opens at the first failed check once the failure threshold is reached', () => {
    const { db, store } = setup();
    store.setSettings(1, { failureThreshold: 3, recoveryThreshold: 1, degradedLatencyMs: null });
    const feed = (status: ServiceStatus['status'], minute: number) =>
      store.observe([service], { 1: state(status, minute) });
    feed('unavailable', 0);
    feed('unavailable', 1);
    expect(store.open()).toEqual({});
    feed('unavailable', 2);
    expect(store.open()[1]).toMatchObject({
      startedAt: t0,
      endedAt: null,
      reason: 'error-status',
      httpStatus: 502,
      failedChecks: 3,
    });
    feed('unavailable', 3);
    expect(store.open()[1]?.failedChecks).toBe(4);
    expect(db.prepare('SELECT COUNT(*) AS n FROM service_incidents').get()).toEqual({ n: 1 });
  });

  it('treats isolated failures below the threshold as noise', () => {
    const { store } = setup();
    store.setSettings(1, { failureThreshold: 3, recoveryThreshold: 1, degradedLatencyMs: null });
    const feed = (status: ServiceStatus['status'], minute: number) =>
      store.observe([service], { 1: state(status, minute) });
    feed('unavailable', 0);
    feed('unavailable', 1);
    feed('available', 2);
    feed('unavailable', 3);
    feed('unavailable', 4);
    expect(store.open()).toEqual({});
    expect(store.list(1).incidents).toEqual([]);
  });

  it('closes at the first success of the recovery streak and ignores unknown checks', () => {
    const { store } = setup();
    store.setSettings(1, { failureThreshold: 1, recoveryThreshold: 2, degradedLatencyMs: null });
    const feed = (status: ServiceStatus['status'], minute: number) =>
      store.observe([service], { 1: state(status, minute) });
    feed('unavailable', 0);
    feed('available', 1);
    feed('unknown', 2);
    expect(store.open()[1]).toBeDefined();
    // A failure in the middle restarts the recovery count.
    feed('unavailable', 3);
    feed('available', 4);
    feed('available', 5);
    expect(store.open()).toEqual({});
    expect(store.list(1).incidents).toMatchObject([
      { startedAt: t0, endedAt: t0 + 4 * MIN, failedChecks: 2 },
    ]);
  });

  it('counts a check once however often the same state is published', () => {
    const { store } = setup();
    const down = state('unavailable', 0);
    store.observe([service], { 1: down });
    store.observe([service], { 1: down });
    store.observe([service], { 1: down });
    expect(store.open()[1]?.failedChecks).toBe(1);
  });

  it('resumes an open incident after a restart instead of opening another', () => {
    const { db, store } = setup();
    store.observe([service], { 1: state('unavailable', 0) });
    const restarted = createIncidentStore(db);
    restarted.observe([service], { 1: state('unavailable', 1) });
    restarted.observe([service], { 1: state('available', 2) });
    expect(restarted.list(1).incidents).toMatchObject([
      { startedAt: t0, endedAt: t0 + 2 * MIN, failedChecks: 2 },
    ]);
  });

  it('builds incidents from the stored history once, and only for the current configuration', () => {
    const { db, store } = setup();
    const add = (minute: number, status: string, signature = serviceSignature(service)) =>
      db
        .prepare(
          'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(1,?,?,?)',
        )
        .run(
          signature,
          t0 + minute * MIN,
          JSON.stringify({ status, reason: 'no-response', httpStatus: null, latencyMs: null }),
        );
    add(0, 'available');
    add(1, 'unavailable');
    add(2, 'unavailable');
    add(3, 'available');
    add(4, 'unavailable');
    add(-5, 'unavailable', 'older-configuration');
    expect(store.rebuildFromHistory([service])).toBe(2);
    expect(store.list(1).incidents.map((i) => [i.startedAt, i.endedAt])).toEqual([
      [t0 + 4 * MIN, null],
      [t0 + MIN, t0 + 3 * MIN],
    ]);
    // Never twice, and the live feed carries on from the last stored check.
    expect(store.rebuildFromHistory([service])).toBe(0);
    store.observe([service], { 1: state('unavailable', 4) });
    expect(store.open()[1]?.failedChecks).toBe(1);
    store.observe([service], { 1: state('available', 5) });
    expect(store.open()).toEqual({});
  });

  it('stores default settings as the absence of a row and reads them back', () => {
    const { db, store } = setup();
    expect(store.settingsOf(2)).toEqual({
      failureThreshold: 1,
      recoveryThreshold: 1,
      degradedLatencyMs: null,
    });
    store.setSettings(2, { failureThreshold: 3, recoveryThreshold: 2, degradedLatencyMs: 800 });
    expect(store.settingsOf(2)).toEqual({
      failureThreshold: 3,
      recoveryThreshold: 2,
      degradedLatencyMs: 800,
    });
    store.setSettings(2, { failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: null });
    expect(db.prepare('SELECT COUNT(*) AS n FROM service_monitor_settings').get()).toEqual({
      n: 0,
    });
  });
});

describe('overview', () => {
  const insert = (db: DatabaseSync, startedAgo: number, durationMs: number | null) =>
    db
      .prepare(
        'INSERT INTO service_incidents(service_id,started_at,ended_at,reason) VALUES(1,?,?,?)',
      )
      .run(
        t0 - startedAgo,
        durationMs === null ? null : t0 - startedAgo + durationMs,
        'error-status',
      );

  it('counts incidents per week, averages recovery time and finds the longest clean stretch', () => {
    const { db, store } = setup();
    db.prepare(
      'INSERT INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(1,?,?,?)',
    ).run('x', t0 - 30 * DAY, '{"status":"available"}');
    insert(db, 10 * DAY, 10 * MIN); // previous week
    insert(db, 3 * DAY, 20 * MIN);
    insert(db, 1 * DAY, 10 * MIN);
    const body = store.overview(() => ({}), t0);
    expect(body.incidents7d).toBe(2);
    expect(body.incidentsPrevious7d).toBe(1);
    expect(body.mttrMs).toBe(Math.round(((10 + 20 + 10) * MIN) / 3));
    // 30 d back to the first incident (20 d) is the longest gap.
    expect(body.longestCleanMs).toBe(20 * DAY);
    expect(body.sla).toEqual({ targetPct: 99.9, actualPct: null });
  });

  it('reports the open incident, the configured target and the fleet availability', () => {
    const { db, store } = setup();
    insert(db, 5 * MIN, null);
    store.setSettings(1, { failureThreshold: 3, recoveryThreshold: 2, degradedLatencyMs: 800 });
    const summary: UptimeSummary = {
      range: '30d',
      uptimePct: 99,
      checks: 1100,
      downChecks: 100,
      unknownChecks: 0,
      lastLatencyMs: 1,
      reconfigured: false,
      buckets: [],
    };
    const body = store.overview(() => ({ 1: { ...summary } }), t0);
    expect(body.open[1]).toMatchObject({ endedAt: null, startedAt: t0 - 5 * MIN });
    expect(body.settings[1]).toEqual({
      failureThreshold: 3,
      recoveryThreshold: 2,
      degradedLatencyMs: 800,
    });
    expect(body.sla.actualPct).toBe(90.91);
  });

  it('opens no service incident when the monitor itself cannot measure, and one when only a service fails', () => {
    const { db, store } = setup();
    db.exec(
      "CREATE TABLE measurement_incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at INTEGER NOT NULL,ended_at INTEGER,reason TEXT NOT NULL,failing INTEGER NOT NULL,measured INTEGER NOT NULL,monitors TEXT NOT NULL DEFAULT '[]')",
    );
    const guard = createMeasurementGuard(db);
    const fleet = Array.from({ length: 6 }, (_, index) => ({ ...service, id: index + 1 }));
    const publish = (outcomes: ServiceStatus['status'][], minute: number) => {
      const states = Object.fromEntries(
        outcomes.map((status, index) => [
          index + 1,
          state(status, minute, status === 'available' ? 'reachable' : 'no-response', null),
        ]),
      );
      guard.observe(fleet, states, t0 + minute * MIN);
      store.observe(fleet, guard.mask(states));
    };
    publish(Array(6).fill('unavailable'), 0);
    publish(Array(6).fill('unavailable'), 1);
    publish(Array(6).fill('unavailable'), 2);
    expect(store.open()).toEqual({});
    expect(db.prepare('SELECT COUNT(*) AS n FROM service_incidents').get()).toEqual({ n: 0 });
    expect(guard.current()).not.toBeNull();

    // Measuring again: the first cycle after recovery decides, and nothing is inherited.
    publish(['unavailable', ...Array(5).fill('available')], 3);
    expect(guard.current()).toBeNull();
    expect(store.open()[1]).toMatchObject({ failedChecks: 1 });
    expect(Object.keys(store.open())).toEqual(['1']);
  });
});
