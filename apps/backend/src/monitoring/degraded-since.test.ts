import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { createDegradedSince } from './degraded-since.js';
import type { MonitoringService } from './service-source.js';
import type { ServiceStatus } from './monitor.js';

const service = { id: 1, url: 'https://example.test', allowPrivate: false } as MonitoringService;
const state = (
  at: number,
  latencyMs: number | null,
  reason: ServiceStatus['reason'] = 'responding',
): ServiceStatus => ({
  status: 'available',
  lastAttempt: new Date(at).toISOString(),
  reason,
  httpStatus: 200,
  latencyMs,
});
it('tracks observed degradation across checks, recovery, threshold changes, and restarts', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER); INSERT INTO service_monitor_settings VALUES (1,100)',
  );
  const tracker = createDegradedSince(db);
  const observe = (at: number, latency: number, now = at) =>
    tracker.observe([service], { 1: state(at, latency) }, now);
  observe(1000, 150);
  expect(tracker.since(1, 100, 1000)).toBe(1000);
  observe(2000, 200);
  expect(tracker.since(1, 100, 2000)).toBe(1000);
  expect(tracker.since(1, 100, 1000)).toBeNull();
  observe(3000, 50);
  expect(tracker.since(1, 100, 3000)).toBeNull();
  observe(4000, 200);
  expect(tracker.since(1, 100, 4000)).toBe(4000);
  db.exec('UPDATE service_monitor_settings SET degraded_latency_ms=150');
  expect(tracker.since(1, 150, 4000)).toBeNull();
  observe(4000, 200, 5000);
  expect(tracker.since(1, 150, 4000)).toBe(5000);
  observe(5500, 120);
  expect(tracker.since(1, 150, 5500)).toBeNull();
  db.exec('UPDATE service_monitor_settings SET degraded_latency_ms=100');
  observe(5500, 120, 5700);
  expect(tracker.since(1, 100, 5500)).toBe(5700);
  db.exec('UPDATE service_monitor_settings SET degraded_latency_ms=150');
  const restarted = createDegradedSince(db);
  expect(restarted.since(1, 150, 4000)).toBeNull();
  restarted.observe([service], { 1: state(6000, 200) }, 6000);
  expect(restarted.since(1, 150, 6000)).toBe(6000);
  restarted.observe([], {}, 7000);
  expect(restarted.since(1, 150, 6000)).toBeNull();
  db.close();
});
it('does not retain maintenance or invalid observation times', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(
    'CREATE TABLE service_monitor_settings(service_id INTEGER, degraded_latency_ms INTEGER); INSERT INTO service_monitor_settings VALUES (1,100)',
  );
  const tracker = createDegradedSince(db);
  tracker.observe([service], { 1: state(1000, 150) }, 1000);
  tracker.observe([service], { 1: state(2000, 150, 'maintenance') }, 2000);
  expect(tracker.since(1, 100, 2000)).toBeNull();
  tracker.observe([service], { 1: state(3000, 150) }, 2000);
  expect(tracker.since(1, 100, 3000)).toBeNull();
  db.close();
});
