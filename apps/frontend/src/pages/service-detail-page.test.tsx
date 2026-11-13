// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Service } from '@homora/shared';
import { ServiceDetailPage } from './service-detail-page';

const service = {
  id: 7,
  name: 'Portainer',
  url: 'https://portainer.example.com',
  category: 'Infra',
  description: '',
  icon: '',
  position: 0,
  allowPrivate: false,
  checkType: 'http',
  checkInterval: 60,
} as Service;
const now = Date.now();
const summary = (range: string, uptimePct: number, previousUptimePct: number | null) => ({
  range,
  uptimePct,
  previousUptimePct,
  checks: 100,
  downChecks: 1,
  unknownChecks: 0,
  lastLatencyMs: 40,
  reconfigured: false,
  buckets: [],
});
const routes: Record<string, unknown> = {
  '/api/services/7/uptime?range=24h': summary('24h', 99.5, 98),
  '/api/services/7/uptime?range=7d': summary('7d', 99, 99.5),
  '/api/services/7/uptime?range=30d': summary('30d', 99, null),
  '/api/services/7/latency?range=24h': {
    range: '24h',
    bucketMs: 1_800_000,
    start: now - 86_400_000,
    p50: 40,
    p95: 90,
    max: 120,
    points: Array.from({ length: 48 }, (_, i) => ({
      start: now - 86_400_000 + i * 1_800_000,
      p50: 40,
      p95: 90,
      max: 120,
      checks: 10,
    })),
  },
  '/api/services/7/insights': {
    generatedAt: now,
    heat: [{ hour: now - 3_600_000, up: 58, down: 2, unknown: 0 }],
    reasons: [{ reason: 'error-status', httpStatus: 502, count: 2 }],
    recent: [
      {
        observedAt: now - 1000,
        status: 'unavailable',
        reason: 'error-status',
        httpStatus: 502,
        latencyMs: null,
      },
      {
        observedAt: now - 61_000,
        status: 'available',
        reason: 'responding',
        httpStatus: 200,
        latencyMs: 42,
      },
    ],
  },
  '/api/services/7/incidents?limit=100': {
    incidents: [
      {
        id: 1,
        serviceId: 7,
        startedAt: now - 600_000,
        endedAt: now - 300_000,
        reason: 'error-status',
        httpStatus: 502,
        failedChecks: 3,
      },
    ],
    nextBefore: null,
  },
  '/api/status-overview': {
    generatedAt: now,
    settings: {},
    open: {},
    incidents7d: 1,
    incidentsPrevious7d: 0,
    mttrMs: 300_000,
    longestCleanMs: 1,
    sla: { targetPct: 99.9, actualPct: 99 },
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPage(id = 7, services = [service]) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url in routes
          ? new Response(JSON.stringify(routes[url]))
          : new Response('{}', { status: 404 }),
      ),
    ),
  );
  return render(
    <ServiceDetailPage
      id={id}
      services={services}
      loaded
      statuses={{ 7: { status: 'available', lastAttempt: null, latencyMs: 40 } }}
      blockedIds={new Set()}
      navigate={() => {}}
    />,
  );
}

it('shows the numbers, comparison, failure reasons, incidents and latest checks', async () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: /Portainer/ })).toBeTruthy();
  expect(await screen.findByText(/\+1[.,]50 pp/)).toBeTruthy();
  expect(screen.getByText(/−0[.,]50 pp/)).toBeTruthy();
  expect(await screen.findByRole('img', { name: /median|mediana/i })).toBeTruthy();
  await waitFor(() => expect(screen.getAllByText(/502/).length).toBeGreaterThan(1));
  expect(screen.getByRole('group', { name: /90/ })).toBeTruthy();
  expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(4);
});

it('says so when the service does not exist', () => {
  renderPage(99);
  expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
});
