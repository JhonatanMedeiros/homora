import { expect, it } from 'vitest';
import { matchesStatusFilter, statusBucket } from './status-filter-model';

const up = (latencyMs: number, reason?: string) =>
  ({ status: 'available', latencyMs, reason }) as never;

it('buckets a service by its worst visible state', () => {
  const settings = { failureThreshold: 3, recoveryThreshold: 2, degradedLatencyMs: 800 };
  expect(statusBucket({ status: 'unavailable' } as never, settings, false)).toBe('down');
  expect(statusBucket({ status: 'unavailable' } as never, settings, true)).toBe('other');
  expect(statusBucket(up(1200), settings, false)).toBe('degraded');
  expect(statusBucket(up(100), settings, false)).toBe('other');
  expect(statusBucket(up(100, 'maintenance'), settings, false)).toBe('maintenance');
  expect(statusBucket(undefined, undefined, false)).toBe('other');
});

it('"all" matches every bucket and a filter only its own', () => {
  expect(matchesStatusFilter('all', 'other')).toBe(true);
  expect(matchesStatusFilter('down', 'down')).toBe(true);
  expect(matchesStatusFilter('down', 'degraded')).toBe(false);
});
