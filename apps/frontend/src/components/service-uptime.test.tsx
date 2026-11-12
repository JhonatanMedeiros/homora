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
  expect(screen.getByRole('img', { name: /99,42%.*288 checagens, 2 falharam/ })).toBeTruthy();
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
  expect(screen.getByRole('img', { name: /Sem disponibilidade ainda/ })).toBeTruthy();
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
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => summary({ p95LatencyMs: 210 }),
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
