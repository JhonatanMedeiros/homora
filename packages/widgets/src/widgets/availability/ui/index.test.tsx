// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WidgetHostProvider } from '../../../ui/host.js';
import type { MonitoringAvailability } from '../../../monitoring.js';
import { en } from '../messages.js';
import { AvailabilityContent, AvailabilityView, widgetUI } from './index.js';
import type { AvailabilityReading } from './use-reading.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const t = (key: string, params?: Record<string, string | number>) =>
  Object.entries(params ?? {}).reduce(
    (s, [k, v]) => s.replace(`{${k}}`, String(v)),
    en[key as keyof typeof en] ?? key,
  );

function renderContent(
  reading: AvailabilityReading,
  options: {
    target?: string;
    wide?: boolean;
    openMonitor?: (id: number, hasService: boolean) => void;
  } = {},
) {
  const openMonitor = options.openMonitor ?? vi.fn();
  render(
    <WidgetHostProvider value={{ locale: 'en', t, wide: options.wide ?? false, openMonitor }}>
      <AvailabilityContent
        config={{ target: options.target ?? 'Jellyfin', range: '24h' }}
        reading={reading}
      />
    </WidgetHostProvider>,
  );
  return openMonitor;
}

describe('availability widget UI', () => {
  it('renders unconfigured, loading, error, and missing/renamed target states', () => {
    renderContent({ status: 'unconfigured' }, { target: '' });
    expect(screen.getByText(en['availabilityWidget.unconfigured'])).toBeTruthy();
    cleanup();

    renderContent({ status: 'loading' });
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    cleanup();

    renderContent({ status: 'error' });
    expect(screen.getByRole('alert').textContent).toContain('Could not load availability');
    cleanup();

    renderContent(
      {
        status: 'ready',
        stale: true,
        now: 1000,
        data: { generatedAt: 1000, range: '24h', target: null },
      },
      { target: 'Old Service' },
    );
    expect(screen.getByText('Target "Old Service" was not found.')).toBeTruthy();
    expect(screen.getByText(/Showing outdated data/)).toBeTruthy();
  });

  it('renders service card availability, maintenance/unknown exclusion, and opens details', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const open = renderContent(
      {
        status: 'ready',
        stale: false,
        now,
        data: {
          generatedAt: now,
          range: '24h',
          target: {
            id: 7,
            name: 'Jellyfin',
            isService: true,
            state: 'ok',
            lastAttempt: now - 30_000,
            stale: false,
            uptimePct: 98.5,
            checks: 204,
            upChecks: 197,
            downChecks: 3,
            unknownChecks: 4,
            minChecks: 5,
            reconfigured: false,
            buckets: [
              { start: '2026-01-01T11:00:00.000Z', status: 'up', checks: 10 },
              { start: '2026-01-01T11:30:00.000Z', status: 'partial', checks: 10 },
            ],
          },
        },
      },
      { wide: true },
    );
    expect(screen.getByText('98.50%')).toBeTruthy();
    expect(screen.getByText('Service')).toBeTruthy();
    expect(screen.getByText('Up')).toBeTruthy();
    expect(screen.getByText('197 up · 3 down')).toBeTruthy();
    expect(screen.getByText('4 maintenance/unknown excluded')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Jellyfin availability over 24 hours/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open Jellyfin details' }));
    expect(open).toHaveBeenCalledWith(7, true);
  });

  it('renders standalone probe with insufficient data and stale check notice', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const open = renderContent({
      status: 'ready',
      stale: false,
      now,
      data: {
        generatedAt: now,
        range: '7d',
        target: {
          id: 12,
          name: 'DNS Probe',
          isService: false,
          state: 'maintenance',
          lastAttempt: now - 600_000,
          stale: true,
          uptimePct: null,
          checks: 5,
          upChecks: 3,
          downChecks: 0,
          unknownChecks: 2,
          minChecks: 5,
          reconfigured: true,
          buckets: [{ start: '2026-01-01T10:00:00.000Z', status: 'unknown', checks: 2 }],
        },
      },
    });
    expect(screen.getByText('Probe')).toBeTruthy();
    expect(screen.getByText('Maintenance')).toBeTruthy();
    expect(screen.getByText('Insufficient data')).toBeTruthy();
    expect(screen.getByText('3 of 5 checks needed for availability')).toBeTruthy();
    expect(screen.getByText('2 maintenance/unknown excluded')).toBeTruthy();
    expect(screen.getByText(/Last check/)).toBeTruthy();
    expect(screen.getByText(en['availabilityWidget.reconfigured'])).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open probes for DNS Probe' }));
    expect(open).toHaveBeenCalledWith(12, false);
  });

  it('retains last good reading as stale when refresh fails', async () => {
    vi.useFakeTimers();
    const first: MonitoringAvailability = {
      generatedAt: Date.now(),
      range: '24h',
      target: {
        id: 1,
        name: 'API',
        isService: true,
        state: 'ok',
        lastAttempt: Date.now(),
        stale: false,
        uptimePct: 100,
        checks: 10,
        upChecks: 10,
        downChecks: 0,
        unknownChecks: 0,
        minChecks: 5,
        reconfigured: false,
        buckets: [{ start: '2026-01-01T00:00:00.000Z', status: 'up', checks: 10 }],
      },
    };
    const readAvailability = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('offline'));

    render(
      <WidgetHostProvider
        value={{
          locale: 'en',
          t,
          monitoring: {
            readSummary: vi.fn(),
            readScopes: vi.fn(),
            readAvailability,
          },
        }}
      >
        <AvailabilityView config={{ target: 'API', range: '24h' }} />
      </WidgetHostProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('100%')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText(/Showing outdated data/)).toBeTruthy();
  });

  it('lists services and probes in editor and validates submission', async () => {
    const onChange = vi.fn();
    const Editor = widgetUI.Editor;
    const readTargets = vi.fn(async () => [
      { name: 'Jellyfin', isService: true },
      { name: 'Ping 1.1.1.1', isService: false },
    ]);
    render(
      <WidgetHostProvider
        value={{
          locale: 'en',
          t,
          monitoring: {
            readSummary: vi.fn(),
            readScopes: vi.fn(),
            readTargets,
          },
        }}
      >
        <Editor config={{ target: '', range: '24h' }} onChange={onChange} />
      </WidgetHostProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(readTargets).toHaveBeenCalledTimes(1);
    expect(widgetUI.canSubmit?.({ target: '', range: '24h' })).toBe(false);
    expect(widgetUI.canSubmit?.({ target: 'Ping 1.1.1.1', range: '7d' })).toBe(true);

    fireEvent.click(screen.getByLabelText('Service or probe'));
    expect(await screen.findByText('Jellyfin (Service)')).toBeTruthy();
    fireEvent.click(screen.getByText('Ping 1.1.1.1 (Probe)'));
    expect(onChange).toHaveBeenCalledWith({ target: 'Ping 1.1.1.1', range: '24h' });
  });
});
