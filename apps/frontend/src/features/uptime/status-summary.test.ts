import type { StatusOverview } from '@homora/shared';
import { beforeEach, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { pillText, summarizeStatus } from '@/features/uptime/status-summary';

beforeEach(() => setLocale('en'));

const now = Date.parse('2026-11-12T21:00:00.000Z');
const services = [
  { id: 1, name: 'Radarr' },
  { id: 2, name: 'Sonarr' },
  { id: 3, name: 'Plex' },
];
const ok = { status: 'available' as const, lastAttempt: null, latencyMs: 40 };
const down = { status: 'unavailable' as const, lastAttempt: null };
const overview = (extra: Partial<StatusOverview> = {}): StatusOverview => ({
  generatedAt: '2026-11-12T21:00:00.000Z',
  settings: {},
  open: {},
  incidents7d: 0,
  incidentsPrevious7d: 0,
  mttrMs: null,
  longestCleanMs: 0,
  sla: { targetPct: 99.9, actualPct: null },
  ...extra,
});

it('says everything is up when nothing is wrong', () => {
  const summary = summarizeStatus({
    services,
    statuses: { 1: ok, 2: ok, 3: ok },
    blockedIds: new Set(),
    now,
  });
  expect(summary.tone).toBe('ok');
  expect(summary.problems).toBe(0);
  expect(pillText(summary)).toBe('All up');
});

it('counts offline and slow services as problems and names the first ones', () => {
  const summary = summarizeStatus({
    services,
    statuses: { 1: down, 2: { ...ok, latencyMs: 1900 }, 3: ok },
    blockedIds: new Set(),
    overview: overview({
      settings: { 2: { failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: 800 } },
      open: {
        1: {
          id: 9,
          serviceId: 1,
          startedAt: now - 14 * 60_000,
          endedAt: null,
          reason: 'error-status',
          httpStatus: 502,
          failedChecks: 3,
        },
      },
    }),
    now,
  });
  expect(summary.tone).toBe('down');
  expect(summary.problems).toBe(2);
  expect(summary.down).toHaveLength(1);
  expect(summary.slow).toHaveLength(1);
  expect(pillText(summary)).toBe('2 problems');
});

it('uses the singular for one problem', () => {
  const summary = summarizeStatus({
    services,
    statuses: { 1: down, 2: ok, 3: ok },
    blockedIds: new Set(),
    now,
  });
  expect(pillText(summary)).toBe('1 problem');
});

it('does not call a blocked service down', () => {
  const summary = summarizeStatus({
    services,
    statuses: { 1: down, 2: ok, 3: ok },
    blockedIds: new Set([1]),
    now,
  });
  expect(summary.problems).toBe(0);
  expect(summary.blocked).toBe(1);
  expect(summary.tone).toBe('warn');
  expect(pillText(summary)).toBe('Partly monitored');
});

it('says the monitor cannot measure when it has a measurement failure', () => {
  const summary = summarizeStatus({
    services,
    statuses: {
      1: { status: 'unavailable', lastAttempt: null, reason: 'no-response' },
      2: { status: 'unavailable', lastAttempt: null, reason: 'no-response' },
      3: { status: 'unavailable', lastAttempt: null, reason: 'no-response' },
    },
    blockedIds: new Set(),
    overview: overview({
      measurement: { startedAt: now - 60_000, reason: 'no-response', failing: 3, measured: 3 },
    }),
    now,
  });
  expect(summary.tone).toBe('warn');
  expect(pillText(summary)).toBe('Cannot measure');
});
