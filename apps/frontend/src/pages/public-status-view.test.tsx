// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PublicStatusView, type PublicStatus } from './status-page';
import { setLocale } from '@/i18n';

afterEach(cleanup);

const base: PublicStatus = {
  title: 'Lab',
  updatedAt: '2026-01-01T00:00:00.000Z',
  services: [
    {
      name: 'Jellyfin',
      category: 'Media',
      status: 'up',
      checkedAt: null,
      uptime: 100,
      bars: Array(24).fill('up'),
      days: Array(90).fill('up'),
      uptime90: 99.9,
    },
  ],
};

it('shows 90 daily bars, the 90-day uptime, incidents and a maintenance notice', () => {
  setLocale('en');
  render(
    <PublicStatusView
      data={{
        ...base,
        incidents: [
          {
            name: 'Jellyfin',
            startedAt: '2025-12-31T10:00:00.000Z',
            endedAt: '2025-12-31T10:30:00.000Z',
          },
        ],
        maintenance: [
          {
            name: 'Jellyfin',
            startsAt: '2026-01-02T01:00:00.000Z',
            endsAt: '2026-01-02T02:00:00.000Z',
            active: false,
          },
        ],
      }}
    />,
  );
  const bars = screen.getByRole('img', { name: 'Last 90 days, one bar per day' });
  expect(bars.children).toHaveLength(90);
  expect(screen.getByText('99.9% in the last 90 days')).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Scheduled maintenance' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Incidents in the last 30 days' })).toBeTruthy();
});

it('still renders for a server without the 90-day data', () => {
  setLocale('en');
  const legacy = { ...base, services: [{ ...base.services[0], days: undefined }] };
  render(<PublicStatusView data={legacy} />);
  expect(screen.queryByRole('img', { name: /90 days/ })).toBeNull();
  expect(screen.queryByText('Incidents in the last 30 days')).toBeNull();
});

it('says monitoring is unavailable, in neutral words, when the monitor cannot measure', () => {
  setLocale('en');
  render(
    <PublicStatusView
      data={{
        ...base,
        monitoring: 'unavailable',
        services: [{ ...base.services[0], status: 'unknown' }],
      }}
    />,
  );
  expect(screen.getByRole('status').textContent).toContain('Monitoring unavailable');
  expect(screen.getByRole('status').textContent).toContain('not a report that they are down');
  expect(screen.queryByText('All systems operational')).toBeNull();
  expect(screen.queryByText('Some services are down')).toBeNull();
});
