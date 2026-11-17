// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WidgetHostProvider, type MonitoringReading } from '../../../ui/host.js';
import { defaultRecentIncidentsConfig } from '../definition.js';
import { RecentIncidentsView } from './index.js';
import { en } from '../messages.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const t = (key: string, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    en[key as keyof typeof en] ?? key,
  );
function show(monitoring: MonitoringReading, wide = true, openMonitor = vi.fn()) {
  render(
    <WidgetHostProvider value={{ locale: 'en', t, incidentReading: monitoring, wide, openMonitor }}>
      <RecentIncidentsView config={defaultRecentIncidentsConfig} />
    </WidgetHostProvider>,
  );
  return openMonitor;
}
it('shows loading, empty, error and stale states', () => {
  show({ status: 'loading' });
  expect(screen.getByRole('status')).toBeTruthy();
  cleanup();
  show({ status: 'error' });
  expect(screen.getByRole('alert').textContent).toContain('Could not load');
  cleanup();
  show({
    status: 'ready',
    stale: true,
    data: { generatedAt: Date.now(), periodDays: 7, items: [], truncated: false },
  });
  expect(screen.getByText('No incidents in this period')).toBeTruthy();
  expect(screen.getByText('Showing outdated data')).toBeTruthy();
});
it('provides full accessible text and opens a monitor by keyboard and pointer', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  const now = Date.now();
  const open = show({
    status: 'ready',
    stale: false,
    data: {
      generatedAt: now,
      periodDays: 7,
      truncated: true,
      items: [
        {
          id: 1,
          monitorId: 3,
          name: 'Nextcloud',
          startedAt: now - 120_000,
          endedAt: null,
          reason: 'no-response',
          httpStatus: null,
          hasService: true,
        },
      ],
    },
  });
  const row = screen.getByRole('button', { name: /Nextcloud, ongoing since.*2 minutes/ });
  row.focus();
  expect(document.activeElement).toBe(row);
  fireEvent.click(row);
  expect(open).toHaveBeenCalledWith(3, true);
  expect(screen.getByText('Reason: No response')).toBeTruthy();
  expect(screen.getByText('More incidents match these filters.')).toBeTruthy();
});
