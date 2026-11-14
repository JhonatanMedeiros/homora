import { expect, it } from 'vitest';
import type { Probe } from '@homora/shared';
import { deriveHomeProbes } from './home-probes-model';
import { STATUS_FILTERS } from './status-filter-model';

const probe = (id: number, name: string, address: string) =>
  ({ id, name, address, checkType: 'tcp' }) as Probe;
const probes = [probe(1, 'Internet', '1.1.1.1:53'), probe(2, 'Router', '192.168.0.1:80')];
const statuses = {
  1: { status: 'available', lastAttempt: null },
  2: { status: 'unavailable', lastAttempt: null, reason: 'timeout' },
} as never;
const zero = Object.fromEntries(STATUS_FILTERS.map((filter) => [filter, 0])) as Record<
  (typeof STATUS_FILTERS)[number],
  number
>;
const base = {
  probes,
  statuses,
  monitorSettings: undefined,
  browsing: true,
  statusFilter: 'all' as const,
  statusCounts: zero,
};

it('lists every probe and reports the offline one as down', () => {
  const result = deriveHomeProbes(base);
  expect(result.probeViews.map((item) => item.id)).toEqual([1, 2]);
  expect(result.downProbes.map((item) => item.id)).toEqual([2]);
  expect([...result.probeIds]).toEqual([2]);
  expect(result.probeStatusItems).toEqual([
    { id: 1, name: 'Internet' },
    { id: 2, name: 'Router' },
  ]);
});

it('applies the status view while browsing, and ignores it otherwise', () => {
  expect(
    deriveHomeProbes({ ...base, statusFilter: 'down' }).probeViews.map((item) => item.id),
  ).toEqual([2]);
  expect(
    deriveHomeProbes({ ...base, browsing: false, statusFilter: 'down' }).probeViews,
  ).toHaveLength(2);
});

it('adds probes to the per-filter counts', () => {
  const counts = deriveHomeProbes({
    ...base,
    statusCounts: { ...zero, all: 3, down: 1 },
  }).countsWithProbes;
  expect(counts.all).toBe(5);
  expect(counts.down).toBe(2);
});

it('copes with probes that have not loaded yet', () => {
  expect(deriveHomeProbes({ ...base, probes: null }).probeViews).toEqual([]);
});
