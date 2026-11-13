import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import type { Service } from '@homora/shared';
import { createMaintenanceStore, MaintenanceError } from './maintenance.js';
import { createServiceMonitor } from './monitor.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.parse('2026-11-12T12:00:00.000Z');

function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY);
    INSERT INTO services(id) VALUES(1),(2);
    CREATE TABLE service_maintenance(id INTEGER PRIMARY KEY AUTOINCREMENT,service_id INTEGER NOT NULL,starts_at INTEGER NOT NULL,ends_at INTEGER NOT NULL,note TEXT NOT NULL DEFAULT '');`);
  return createMaintenanceStore(db);
}
const window = (from: number, to: number, note = '') => ({
  startsAt: now + from,
  endsAt: now + to,
  note,
});

describe('maintenance windows', () => {
  it('schedules, lists upcoming ones soonest first and finds the open one', () => {
    const store = setup();
    store.create(1, window(2 * HOUR, 3 * HOUR, 'later'), now);
    store.create(1, window(-HOUR, HOUR, 'now'), now);
    store.create(2, window(HOUR, 2 * HOUR), now);
    expect(store.upcoming(now).map((item) => item.note)).toEqual(['now', '', 'later']);
    expect(store.upcoming(now, 1)).toHaveLength(2);
    expect([...store.active(now).keys()]).toEqual([1]);
    expect(store.active(now).get(1)?.note).toBe('now');
    expect(store.active(now + 4 * HOUR).size).toBe(0);
  });

  it('rejects short, long, past and overlapping windows and unknown services', () => {
    const store = setup();
    const fails = (code: string, run: () => unknown) =>
      expect(run).toThrowError(expect.objectContaining({ code }) as MaintenanceError);
    fails('invalid-window', () => store.create(1, window(0, 30_000), now));
    fails('invalid-window', () => store.create(1, window(0, 31 * 24 * HOUR), now));
    fails('invalid-window', () => store.create(1, window(-2 * HOUR, -HOUR), now));
    fails('invalid-window', () =>
      store.create(1, { startsAt: 1.5, endsAt: now + HOUR, note: '' }, now),
    );
    fails('service-not-found', () => store.create(9, window(0, HOUR), now));
    store.create(1, window(HOUR, 3 * HOUR), now);
    fails('overlap', () => store.create(1, window(2 * HOUR, 4 * HOUR), now));
    expect(() => store.create(1, window(3 * HOUR, 4 * HOUR), now)).not.toThrow();
    expect(() => store.create(2, window(2 * HOUR, 4 * HOUR), now)).not.toThrow();
  });

  it('cancels a future window, ends an open one now and keeps a finished one', () => {
    const store = setup();
    const future = store.create(1, window(HOUR, 2 * HOUR), now);
    const open = store.create(2, window(-HOUR, HOUR), now);
    expect(store.remove(future.id, now)).toMatchObject({ id: future.id });
    expect(store.upcoming(now, 1)).toEqual([]);
    store.remove(open.id, now);
    expect(store.active(now).size).toBe(0);
    expect(store.ofService(2, now)[0]?.endsAt).toBe(now);
    expect(store.remove(999, now)).toBeNull();
  });
});

describe('monitor and maintenance', () => {
  const services: Service[] = [1, 2].map((id) => ({
    id,
    name: `S${id}`,
    url: `https://s${id}.test/`,
    category: 'x',
    description: '',
  }));

  it('records "maintenance" instead of probing, and probes again as soon as it ends', async () => {
    let clock = now;
    let paused = new Set([1]);
    const check = vi.fn(async () => ({ httpStatus: 200, latencyMs: 4 }));
    const monitor = createServiceMonitor(
      async () => services,
      check,
      () => clock,
      undefined,
      () => paused,
    );
    await monitor.run(true);
    expect(check).toHaveBeenCalledTimes(1);
    expect(monitor.snapshot()[1]).toMatchObject({ status: 'unknown', reason: 'maintenance' });
    expect(monitor.snapshot()[2]).toMatchObject({ status: 'available' });
    // Nothing is due yet and nothing changed: no probes.
    clock += 5_000;
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(1);
    // The window ends: service 1 is probed at once, without waiting for its interval.
    paused = new Set();
    clock += 5_000;
    await monitor.run();
    expect(check).toHaveBeenCalledTimes(2);
    expect(monitor.snapshot()[1]).toMatchObject({ status: 'available', reason: 'responding' });
    // And the other way round: a window that opens mid-interval takes effect immediately.
    paused = new Set([2]);
    clock += 5_000;
    await monitor.run();
    expect(monitor.snapshot()[2]).toMatchObject({ reason: 'maintenance' });
    expect(check).toHaveBeenCalledTimes(2);
  });
});
