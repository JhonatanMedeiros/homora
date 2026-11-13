// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Service, UptimeSummary } from '@homora/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { ServiceUptime, UptimePercent } from '@/components/service-uptime';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const service: Service = {
  id: 4,
  name: 'Wiki',
  url: 'http://wiki.test',
  category: 'Docs',
  description: '',
};
const summary = (extra: Partial<UptimeSummary> = {}): UptimeSummary => ({
  range: '24h',
  uptimePct: 99.42,
  checks: 288,
  downChecks: 2,
  unknownChecks: 1,
  lastLatencyMs: 87,
  reconfigured: false,
  buckets: [
    { start: '2026-11-12T10:00:00.000Z', status: 'up' },
    { start: '2026-11-12T10:30:00.000Z', status: 'down' },
    { start: '2026-11-12T11:00:00.000Z', status: 'unknown' },
  ],
  ...extra,
});

it('describes the bar for screen readers and shows a dash instead of 100% without data', () => {
  const { rerender } = render(
    <ServiceUptime service={service} summary={summary()} range="24h" onRangeChange={() => {}} />,
  );
  expect(screen.getByRole('group', { name: /99,42%.*288 checagens, 2 falharam/ })).toBeTruthy();
  rerender(
    <ServiceUptime
      service={service}
      summary={summary({ uptimePct: null, checks: 2 })}
      range="24h"
      onRangeChange={() => {}}
    />,
  );
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.queryByText(/100/)).toBeNull();
  expect(screen.getByRole('group', { name: /Sem disponibilidade ainda/ })).toBeTruthy();
});

it('renders nothing while there is no summary and a compact percentage for the list', () => {
  const { container, rerender } = render(
    <ServiceUptime service={service} range="24h" onRangeChange={() => {}} />,
  );
  expect(container.textContent).toBe('');
  rerender(<UptimePercent summary={summary()} />);
  expect(screen.getByText('99,42%')).toBeTruthy();
});

it('opens latency, p95 and the period selector, and reports the chosen period', async () => {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    json: async () =>
      url.includes('/incidents') ? { incidents: [] } : summary({ p95LatencyMs: 210 }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  const onRangeChange = vi.fn();
  render(
    <ServiceUptime
      service={service}
      summary={summary({ reconfigured: true })}
      range="24h"
      onRangeChange={onRangeChange}
    />,
  );
  const toggle = screen.getByRole('button', { name: 'Histórico de disponibilidade de Wiki' });
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(await screen.findByText('210 ms')).toBeTruthy();
  expect(screen.getByText('87 ms')).toBeTruthy();
  expect(screen.getByText(/desde a última alteração/)).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith('/api/services/4/uptime?range=24h');
  fireEvent.click(screen.getByRole('radio', { name: '7 d' }));
  await waitFor(() => expect(onRangeChange).toHaveBeenCalledWith('7d'));
});

const detailed = summary({
  buckets: [
    { start: '2026-11-12T10:00:00.000Z', status: 'up', checks: 30, avgLatencyMs: 120 },
    { start: '2026-11-12T10:30:00.000Z', status: 'up', checks: 30, avgLatencyMs: 1840 },
    {
      start: '2026-11-12T11:00:00.000Z',
      status: 'down',
      checks: 30,
      avgLatencyMs: null,
      reason: 'error-status',
      httpStatus: 502,
    },
    { start: '2026-11-12T11:30:00.000Z', status: 'unknown', checks: 0, avgLatencyMs: null },
  ],
});

it('marks slow periods and says why a failed period failed, by click and by keyboard', () => {
  render(
    <ServiceUptime
      service={service}
      summary={detailed}
      range="24h"
      onRangeChange={() => {}}
      monitor={{ failureThreshold: 1, recoveryThreshold: 1, degradedLatencyMs: 800 }}
    />,
  );
  const group = screen.getByRole('group', { name: /99,42%/ });
  const states = [...group.querySelectorAll('[data-state]')].map((bar) =>
    bar.getAttribute('data-state'),
  );
  expect(states).toEqual(['up', 'slow', 'down', 'unknown']);
  const rect = {
    left: 0,
    width: 400,
    top: 0,
    right: 400,
    bottom: 24,
    height: 24,
    x: 0,
    y: 0,
    toJSON() {},
  };
  vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(rect);
  // The third quarter of the bar is the failed period.
  fireEvent.click(group, { clientX: 250 });
  const detail = screen.getByText('Fora do ar').closest('[data-slot="bar-detail"]')!;
  expect(detail.textContent).toContain('HTTP 502');
  expect(detail.textContent).toContain('30 checagens');
  // Arrow keys walk the periods; Escape closes the detail.
  fireEvent.keyDown(group, { key: 'ArrowLeft' });
  expect(screen.getByText('lento').closest('[data-slot="bar-detail"]')!.textContent).toContain(
    'média 1840 ms',
  );
  fireEvent.keyDown(group, { key: 'End' });
  expect(screen.getByText('sem dados').closest('[data-slot="bar-detail"]')!.textContent).toContain(
    'Nenhuma checagem neste período',
  );
  fireEvent.keyDown(group, { key: 'Escape' });
  expect(document.querySelector('[data-slot="bar-detail"]')).toBeNull();
});

it('shows a tooltip while the pointer moves over the bar', () => {
  render(
    <ServiceUptime service={service} summary={detailed} range="24h" onRangeChange={() => {}} />,
  );
  const group = screen.getByRole('group', { name: /99,42%/ });
  vi.spyOn(group, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 400,
    top: 0,
    right: 400,
    bottom: 24,
    height: 24,
    x: 0,
    y: 0,
    toJSON() {},
  });
  fireEvent.pointerMove(group, { clientX: 150, pointerType: 'mouse' });
  expect(screen.getByRole('tooltip').textContent).toContain('média 1840 ms');
  fireEvent.pointerLeave(group);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('lists the latest incidents of the service in the history panel', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.includes('/incidents')
          ? {
              incidents: [
                {
                  id: 2,
                  serviceId: 4,
                  startedAt: Date.parse('2026-11-12T10:00:00.000Z'),
                  endedAt: null,
                  reason: 'error-status',
                  httpStatus: 502,
                  failedChecks: 4,
                },
                {
                  id: 1,
                  serviceId: 4,
                  startedAt: Date.parse('2026-11-09T03:12:00.000Z'),
                  endedAt: Date.parse('2026-11-09T03:14:00.000Z'),
                  reason: 'no-response',
                  httpStatus: null,
                  failedChecks: 2,
                },
              ],
            }
          : summary({ p95LatencyMs: 1 }),
    })),
  );
  render(
    <ServiceUptime service={service} summary={detailed} range="24h" onRangeChange={() => {}} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Histórico de disponibilidade de Wiki' }));
  const region = await screen.findByRole('region', { name: 'Incidentes recentes' });
  await waitFor(() => expect(region.querySelectorAll('li')).toHaveLength(2));
  const [open, closed] = [...region.querySelectorAll('li')];
  expect(open?.textContent).toContain('em andamento');
  expect(open?.textContent).toContain('HTTP 502');
  expect(closed?.textContent).toContain('2 min');
  expect(closed?.textContent).toContain('Sem resposta');
  expect(closed?.textContent).toContain('recuperado');
});

it('survives a failing or malformed incident response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: !url.includes('/incidents') || false,
      json: async () => summary({ p95LatencyMs: 1 }),
    })),
  );
  render(
    <ServiceUptime service={service} summary={detailed} range="24h" onRangeChange={() => {}} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Histórico de disponibilidade de Wiki' }));
  expect(await screen.findByText('Não foi possível carregar os incidentes.')).toBeTruthy();
});
