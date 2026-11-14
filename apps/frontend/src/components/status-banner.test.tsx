// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StatusOverview, UptimeSummary } from '@homora/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { StatusBanner } from '@/components/status-banner';

afterEach(cleanup);

const now = Date.parse('2026-11-12T21:00:00.000Z');
const services = [
  { id: 1, name: 'Portainer' },
  { id: 2, name: 'Jellyfin' },
  { id: 3, name: 'Proxmox' },
];
const up = (pct: number | null): UptimeSummary => ({
  range: '24h',
  uptimePct: pct,
  checks: 100,
  downChecks: 0,
  unknownChecks: 0,
  lastLatencyMs: 1,
  reconfigured: false,
  buckets: [],
});
const overview = (extra: Partial<StatusOverview> = {}): StatusOverview => ({
  generatedAt: '2026-11-12T21:00:00.000Z',
  settings: {},
  open: {},
  incidents7d: 5,
  incidentsPrevious7d: 7,
  mttrMs: 6 * 60_000,
  longestCleanMs: 18 * 24 * 3_600_000,
  sla: { targetPct: 99.9, actualPct: 99.94 },
  ...extra,
});
const ok = { status: 'available' as const, lastAttempt: null, latencyMs: 40 };
const down = { status: 'unavailable' as const, lastAttempt: null };

function show(props: Partial<Parameters<typeof StatusBanner>[0]> = {}) {
  return render(
    <StatusBanner
      services={services}
      statuses={{ 1: down, 2: { ...ok, latencyMs: 1840 }, 3: ok }}
      blockedIds={new Set()}
      overview={overview({
        settings: { 2: { failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: 800 } },
        open: {
          1: {
            id: 9,
            serviceId: 1,
            startedAt: now - 27 * 60_000,
            endedAt: null,
            reason: 'error-status',
            httpStatus: 502,
            failedChecks: 3,
          },
        },
      })}
      uptime={{ 1: up(95.94), 2: up(99.02), 3: up(100) }}
      range="24h"
      now={now}
      {...props}
    />,
  );
}

it('names what is wrong and for how long', () => {
  show();
  expect(screen.getByRole('status').textContent).toBe('2 serviços com problema');
  expect(
    screen.getByText(/Portainer fora do ar há 27 min · Jellyfin degradado \(1840 ms\)/),
  ).toBeTruthy();
});

it('shows the week in numbers and the error budget left', () => {
  show();
  expect(screen.getByText('Uptime médio · 24 h').nextElementSibling?.textContent).toBe('98,32%');
  expect(screen.getByText('2 a menos que a semana anterior')).toBeTruthy();
  expect(screen.getByText('6 min')).toBeTruthy();
  expect(screen.getByText('maior período sem queda: 18 d')).toBeTruthy();
  expect(screen.getByText('99,94% atingido')).toBeTruthy();
  // 0,06 of a 0,1 budget is spent, so 40% is left.
  expect(screen.getByText('40% do orçamento de erro restante')).toBeTruthy();
});

it('says all is well only when it is, and is honest about unmonitored services', () => {
  const healthy = { 1: ok, 2: ok, 3: ok };
  const { unmount } = show({ statuses: healthy, overview: overview() });
  expect(screen.getByRole('status').textContent).toBe('Todos os sistemas operacionais');
  unmount();
  show({
    statuses: { ...healthy, 1: { status: 'unknown', lastAttempt: null } },
    blockedIds: new Set([1]),
  });
  expect(screen.getByRole('status').textContent).toBe('Todos os serviços monitorados no ar');
  expect(screen.getByText(/1 serviço sem monitoramento/)).toBeTruthy();
});

it('copes with missing numbers: no overview, no history and an exhausted budget', () => {
  const { unmount } = show({ overview: undefined, uptime: {} });
  expect(screen.getByText('Uptime médio · 24 h').nextElementSibling?.textContent).toBe('—');
  expect(screen.queryByText('Incidentes · 7 d')).toBeNull();
  unmount();
  show({
    overview: overview({
      sla: { targetPct: 99.9, actualPct: 99.5 },
      mttrMs: null,
      incidents7d: 0,
      incidentsPrevious7d: 0,
    }),
  });
  expect(screen.getByText('orçamento de erro esgotado')).toBeTruthy();
  expect(screen.getByText('Nenhum nos últimos 7 dias')).toBeTruthy();
  expect(screen.getByText('Nenhum incidente recuperado')).toBeTruthy();
});

it('renders nothing without services', () => {
  const { container } = show({ services: [] });
  expect(container.textContent).toBe('');
});

it('shows one window per service, with the state in words, and opens the chosen one', () => {
  const onOpen = vi.fn();
  show({
    statuses: { 1: ok, 2: down, 3: ok },
    onOpenService: onOpen,
  });
  const windows = screen.getByRole('list', { name: /janela por serviço/i });
  expect(windows.querySelectorAll('button')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: /Jellyfin: Fora do ar/ }));
  expect(onOpen).toHaveBeenCalledWith(2);
});

it('hides the windows when nothing can open them', () => {
  show({ statuses: { 1: ok, 2: ok, 3: ok } });
  expect(screen.queryByRole('list', { name: /janela por serviço/i })).toBeNull();
});

it('says the monitor cannot measure, instead of listing services as down', () => {
  const onConnections = vi.fn();
  render(
    <StatusBanner
      services={services}
      statuses={{
        1: { ...down, reason: 'no-response' },
        2: { ...down, reason: 'no-response' },
        3: { ...down, reason: 'no-response' },
      }}
      blockedIds={new Set()}
      overview={overview({
        measurement: { startedAt: now - 60_000, reason: 'no-response', failing: 3, measured: 3 },
      })}
      uptime={{}}
      range="24h"
      now={now}
      onOpenConnections={onConnections}
    />,
  );
  expect(screen.getByRole('status').textContent).toBe('O monitoramento não consegue medir agora');
  expect(screen.queryByText(/problema/i)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar conexões' }));
  expect(onConnections).toHaveBeenCalledOnce();
});
