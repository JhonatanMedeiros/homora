// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WidgetHostProvider, type MonitoringProblemsReading } from '../../../ui/host.js';
import { ProblemsContent } from './index.js';
import { en } from '../messages.js';

const now = 1_700_000_000_000;
const translate = (key: string, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    (en as Record<string, string>)[key] ?? key,
  );
const renderView = (reading: MonitoringProblemsReading, openMonitor = vi.fn()) =>
  render(
    <WidgetHostProvider
      value={{
        locale: 'en',
        t: translate,
        openMonitor,
        monitoring: {
          readSummary: async () => {
            throw Error();
          },
          readScopes: async () => ({ pages: [], groups: [] }),
        },
      }}
    >
      <ProblemsContent reading={reading} />
    </WidgetHostProvider>,
  );
const ready = (): MonitoringProblemsReading => ({
  status: 'ready',
  now,
  stale: false,
  data: {
    generatedAt: now,
    total: 3,
    unmeasured: 2,
    truncated: true,
    items: [
      {
        id: 1,
        name: 'Nextcloud',
        state: 'down',
        since: now - 14 * 60_000,
        reason: 'no-response',
        httpStatus: null,
        latencyMs: null,
        lastAttempt: now,
        stale: false,
        isService: true,
      },
    ],
  },
});
afterEach(cleanup);
it('renders a semantic list, count, unmeasured line and accessible button opening the service', () => {
  const open = vi.fn();
  renderView(ready(), open);
  expect(screen.getByRole('list')).toBeTruthy();
  expect(screen.getByText('Showing 1 of 3')).toBeTruthy();
  expect(screen.getByText('2 not measured')).toBeTruthy();
  const button = screen.getByRole('button', {
    name: /Nextcloud, Offline, 14 minutes ago, open details/,
  });
  button.focus();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  expect(open).toHaveBeenCalledWith(1, true);
});
it('shows loading, empty, stale and error independently', () => {
  const view = renderView({ status: 'loading' });
  expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  view.unmount();
  const reading = ready();
  if (reading.status !== 'ready') throw Error();
  reading.data.items = [];
  reading.data.total = 0;
  reading.stale = true;
  reading.data.generatedAt = now - 180_000;
  const empty = renderView(reading);
  expect(screen.getByText('No problems now')).toBeTruthy();
  expect(screen.getByText('Reading from 3 minutes ago')).toBeTruthy();
  expect(screen.getByText('2 not measured')).toBeTruthy();
  empty.unmount();
  renderView({ status: 'error' });
  expect(screen.getByRole('alert').textContent).toBe('Could not load problems.');
});

it('identifies the time for a degraded monitor as an observed age', () => {
  const reading = ready();
  if (reading.status !== 'ready') throw Error();
  reading.data.items[0] = { ...reading.data.items[0]!, state: 'degraded', latencyMs: 1800 };
  renderView(reading);
  expect(screen.getByText(/Latency 1,800 ms above limit/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /Degraded, Observed 14 minutes ago/ })).toBeTruthy();
});
