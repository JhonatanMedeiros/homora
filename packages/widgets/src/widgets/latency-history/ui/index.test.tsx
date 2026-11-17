// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WidgetHostProvider } from '../../../ui/host.js';
import { en } from '../messages.js';
import { widgetUI } from './index.js';

afterEach(cleanup);
const t = (key: string) => en[key as keyof typeof en] ?? key;
const target = 'a'.repeat(32);
const renderWidget = (readLatency: ReturnType<typeof vi.fn>, wide = false) => {
  const Component = widgetUI.View;
  return render(
    <WidgetHostProvider
      value={{
        locale: 'en',
        t,
        wide,
        monitoring: { readLatency, readSummary: vi.fn(), readScopes: vi.fn() },
      }}
    >
      <Component config={{ target, range: '24h' }} />
    </WidgetHostProvider>,
  );
};
it('shows a last reading and leaves chart gaps when the monitor is offline', async () => {
  const now = Date.now();
  renderWidget(
    vi.fn().mockResolvedValue({
      generatedAt: now,
      range: '24h',
      target: {
        id: 1,
        name: 'Server',
        state: 'down',
        stale: false,
        lastAttempt: now,
        lastValid: { observedAt: now - 1000, latencyMs: 22 },
        points: [
          { start: now - 3, p50: 10 },
          { start: now - 2, p50: null },
          { start: now - 1, p50: 30 },
        ],
      },
    }),
    true,
  );
  expect(await screen.findByText(/Last valid reading/)).toBeTruthy();
  expect(screen.getByText('Down')).toBeTruthy();
  const chart = screen.getByRole('img');
  expect(chart.querySelectorAll('polyline')).toHaveLength(0);
  expect(chart.querySelectorAll('circle')).toHaveLength(2);
});
it('shows missing and error states without choosing a different service', async () => {
  const read = vi.fn().mockResolvedValue({ generatedAt: Date.now(), range: '24h', target: null });
  renderWidget(read);
  expect(await screen.findByText(en['latencyWidget.missing'])).toBeTruthy();
  expect(read.mock.calls[0][0].target).toBe(target);
  cleanup();
  renderWidget(vi.fn().mockRejectedValue(new Error('failed')));
  expect((await screen.findByRole('alert')).textContent).toBe(en['latencyWidget.error']);
});

it('never calls a stale or maintenance reading current', async () => {
  const now = Date.now();
  const data = {
    generatedAt: now,
    range: '24h',
    target: {
      id: 1,
      name: 'Server',
      state: 'maintenance',
      stale: true,
      lastAttempt: now,
      lastValid: { observedAt: now, latencyMs: 0 },
      points: [{ start: now, p50: 0 }],
    },
  };
  renderWidget(vi.fn().mockResolvedValue(data));
  expect(await screen.findByText(/Last valid reading/)).toBeTruthy();
  expect(screen.getByText('Maintenance')).toBeTruthy();
  expect(screen.getByText(en['latencyWidget.stale'])).toBeTruthy();
  expect(screen.getByText('0 ms')).toBeTruthy();
  expect(screen.queryByText(/Current reading/)).toBeNull();
});
