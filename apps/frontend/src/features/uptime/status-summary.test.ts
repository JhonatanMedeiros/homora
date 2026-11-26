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

it('uses the same monitor classification as a widget host for the same facts', async () => {
  const { monitoringState } = await import('@homora/widgets');
  const statuses = {
    1: { ...down, reason: 'maintenance' as const },
    2: { ...ok, latencyMs: 1900 },
    3: down,
  };
  const settings = { 2: { failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: 800 } };
  const summary = summarizeStatus({
    services,
    statuses,
    blockedIds: new Set([3]),
    overview: overview({ settings }),
    now,
  });
  expect(summary.windows.map((item) => item.state)).toEqual(
    services.map(({ id }) => {
      const status = statuses[id as 1 | 2 | 3];
      const state = monitoringState({
        status: status.status,
        reason: 'reason' in status ? status.reason : undefined,
        latencyMs: 'latencyMs' in status ? status.latencyMs : undefined,
        degradedLatencyMs: id === 2 ? 800 : undefined,
        blocked: id === 3,
      });
      return state === 'blocked' ? 'unknown' : state;
    }),
  );
  expect(summary.problems).toBe(1);
  expect(summary.blocked).toBe(1);
});

it('matches the widget counts for the same monitoring inputs', async () => {
  const { monitoringState } = await import('@homora/widgets');
  const { summarizeCounts } =
    await import('../../../../../packages/widgets/src/widgets/homelab-summary/definition');
  const statuses = {
    1: { ...down, reason: 'maintenance' as const },
    2: { ...ok, latencyMs: 1900 },
    3: down,
  };
  const settings = { 2: { failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: 800 } };
  const home = summarizeStatus({
    services,
    statuses,
    blockedIds: new Set([3]),
    overview: overview({ settings }),
    now,
  });
  const counts = { ok: 0, down: 0, degraded: 0, maintenance: 0, blocked: 0, unknown: 0 };
  for (const service of services) {
    const status = statuses[service.id as 1 | 2 | 3];
    const state = monitoringState({
      status: status.status,
      reason: 'reason' in status ? status.reason : undefined,
      latencyMs: 'latencyMs' in status ? status.latencyMs : undefined,
      degradedLatencyMs: service.id === 2 ? 800 : undefined,
      blocked: service.id === 3,
    });
    counts[state]++;
  }
  const widget = summarizeCounts(counts);
  expect(widget.problems).toBe(home.problems);
  expect(widget.unmeasured).toBe(home.unknown + home.blocked);
  expect(widget.maintenance).toBe(
    home.windows.filter((window) => window.state === 'maintenance').length,
  );
});

it('says what a total that mixes services, probes and slow ones is made of', () => {
  setLocale('en');
  const summary = summarizeStatus({
    services: [
      { id: 1, name: 'Radarr' },
      { id: 2, name: 'DNS' },
    ],
    statuses: {
      1: down,
      2: down,
    },
    blockedIds: new Set(),
    probeIds: new Set([2]),
    now: 0,
  });
  expect(summary.title).toBe('2 problems');
  expect(summary.breakdown).toBe('1 service offline · 1 probe offline');
});

it('counts certificate days the same way the card does', () => {
  const summary = summarizeStatus({
    services: [{ id: 1, name: 'Caddy' }],
    statuses: { 1: { ...ok, certExpiresAt: 7.5 * 86_400_000 } },
    blockedIds: new Set(),
    now: 0,
  });
  expect(summary.certs).toEqual([{ name: 'Caddy', days: 8 }]);
});

it('does not claim anything is up while nothing was measured', () => {
  const summary = summarizeStatus({ services, statuses: {}, blockedIds: new Set(), now });
  expect(JSON.stringify(summary)).not.toContain('All monitored services are up');
});

it('says the figures are old when statuses cannot be read', () => {
  const summary = summarizeStatus({
    services,
    statuses: { 1: ok, 2: ok, 3: ok },
    blockedIds: new Set(),
    stale: true,
    now,
  });
  expect(summary.stale).toBe(true);
  expect(summary.tone).toBe('warn');
  expect(pillText(summary)).not.toBe('All up');
});
