import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import type { ServiceStatus } from './monitor.js';
import { createMeasurementGuard, type MeasurementTransition } from './measurement.js';

const MIN = 60_000;
const t0 = Date.parse('2026-11-14T06:00:00.000Z');

const services = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => ({ id: index + 1, name: `S${index + 1}` }) as Service,
  );

function status(kind: 'ok' | ServiceStatus['reason'], minute: number): ServiceStatus {
  const ok = kind === 'ok';
  return {
    status: ok ? 'available' : 'unavailable',
    lastAttempt: new Date(t0 + minute * MIN).toISOString(),
    reason: ok ? 'reachable' : kind,
    httpStatus: null,
    latencyMs: null,
  };
}
/** One cycle: every service measured at `minute`, with the given outcome per service. */
const cycle = (outcomes: ('ok' | ServiceStatus['reason'])[], minute: number) =>
  Object.fromEntries(outcomes.map((kind, index) => [index + 1, status(kind, minute)]));

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    `CREATE TABLE measurement_incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at INTEGER NOT NULL,ended_at INTEGER,reason TEXT NOT NULL,failing INTEGER NOT NULL,measured INTEGER NOT NULL,monitors TEXT NOT NULL DEFAULT '[]');`,
  );
  const transitions: MeasurementTransition[] = [];
  const guard = createMeasurementGuard(db, (transition) => transitions.push(transition));
  return { db, guard, transitions };
}
const feed = (
  guard: ReturnType<typeof setup>['guard'],
  outcomes: ('ok' | ServiceStatus['reason'])[],
  minute: number,
) => {
  const states = cycle(outcomes, minute);
  guard.observe(services(outcomes.length), states, t0 + minute * MIN);
  return guard.mask(states);
};

describe('measurement guard', () => {
  it('holds back the first widespread cycle and declares one global incident on the second', () => {
    const { guard, transitions, db } = setup();
    const all = Array(8).fill('destination-blocked');
    const first = feed(guard, all, 0);
    expect(guard.current()).toBeNull();
    expect(Object.values(first).every((state) => state.status === 'unknown')).toBe(true);
    const second = feed(guard, all, 1);
    expect(Object.values(second).every((state) => state.status === 'unknown')).toBe(true);
    expect(guard.current()).toMatchObject({
      reason: 'destination-blocked',
      failing: 8,
      measured: 8,
      endedAt: null,
    });
    expect(transitions.map(({ kind }) => kind)).toEqual(['down']);
    expect(guard.current()?.monitors).toHaveLength(8);
    expect(db.prepare('SELECT COUNT(*) AS n FROM measurement_incidents').get()).toEqual({ n: 1 });
  });

  it('keeps a service with a different reason visible, so it still opens its own incident', () => {
    const { guard } = setup();
    const outcomes = [
      ...Array(7).fill('no-response'),
      'error-status' as const,
      'ok' as const,
      'ok' as const,
    ];
    // 7 of 10 is below 80%: nothing is held, nothing is declared.
    feed(guard, outcomes, 0);
    feed(guard, outcomes, 1);
    expect(guard.current()).toBeNull();

    const widespread = [...Array(8).fill('no-response'), 'error-status' as const, 'ok' as const];
    feed(guard, widespread, 2);
    const masked = feed(guard, widespread, 3);
    expect(guard.current()).not.toBeNull();
    expect(masked[1].status).toBe('unknown');
    expect(masked[9].status).toBe('unavailable');
    expect(masked[10].status).toBe('available');
  });

  it('does nothing below four monitors', () => {
    const { guard } = setup();
    const outcomes = Array(3).fill('no-response');
    feed(guard, outcomes, 0);
    const second = feed(guard, outcomes, 1);
    expect(guard.current()).toBeNull();
    expect(second[1].status).toBe('unavailable');
  });

  it('releases a single widespread cycle that does not repeat', () => {
    const { guard, transitions } = setup();
    feed(guard, Array(5).fill('no-response'), 0);
    const next = feed(guard, Array(5).fill('ok'), 1);
    expect(guard.current()).toBeNull();
    expect(transitions).toEqual([]);
    expect(Object.values(next).every((state) => state.status === 'available')).toBe(true);
  });

  it('does not count the same checks twice', () => {
    const { guard } = setup();
    const states = cycle(Array(5).fill('no-response'), 0);
    guard.observe(services(5), states, t0);
    guard.observe(services(5), states, t0 + 1);
    expect(guard.current()).toBeNull();
  });

  it('closes on recovery and never lets checks made while blind count afterwards', () => {
    const { guard, transitions } = setup();
    const bad = Array(5).fill('no-response');
    feed(guard, bad, 0);
    feed(guard, bad, 1);
    // Four monitors recover; the fifth keeps its stale failure from minute 1.
    const states = {
      ...cycle(Array(5).fill('ok'), 2),
      5: status('no-response', 1),
    };
    guard.observe(services(5), states, t0 + 2 * MIN);
    expect(guard.current()).toBeNull();
    expect(transitions.map(({ kind }) => kind)).toEqual(['down', 'up']);
    expect(transitions[1].incident.endedAt).toBe(t0 + 2 * MIN);
    const masked = guard.mask(states);
    expect(masked[5].status).toBe('unknown');
    expect(masked[1].status).toBe('available');
  });

  it('resumes the open incident after a restart', () => {
    const { db, guard } = setup();
    const bad = Array(5).fill('no-response');
    feed(guard, bad, 0);
    feed(guard, bad, 1);
    const reloaded = createMeasurementGuard(db);
    expect(reloaded.current()?.id).toBe(guard.current()?.id);
    feed(reloaded, Array(5).fill('ok'), 2);
    expect(reloaded.current()).toBeNull();
  });
});
