// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setLocale } from '@/i18n';
import { HomeStatusPill } from '@/components/home-status-pill';
import type { StatusSummary } from '@/features/uptime/status-summary';

beforeEach(() => setLocale('en'));
afterEach(cleanup);

const summary = (extra: Partial<StatusSummary> = {}): StatusSummary => ({
  down: [],
  slow: [],
  unknown: 0,
  blocked: 0,
  certs: [],
  windows: [],
  problems: 0,
  measurement: null,
  title: 'All systems operational',
  subtitle: '',
  breakdown: null,
  stale: false,
  tone: 'ok',
  ...extra,
});

it('shows the state in words and opens the details on press', () => {
  render(
    <HomeStatusPill summary={summary({ problems: 2, tone: 'down' })}>
      {() => <p>Causes go here</p>}
    </HomeStatusPill>,
  );
  const pill = screen.getByRole('button', { name: 'Health: 2 problems. Open details' });
  expect(pill.textContent).toContain('2 problems');
  expect(screen.queryByText('Causes go here')).toBeNull();
  fireEvent.click(pill);
  expect(screen.getByText('Causes go here')).toBeTruthy();
});

it('closes from inside the details', () => {
  render(
    <HomeStatusPill summary={summary()}>
      {(close) => (
        <button type="button" onClick={close}>
          Open a service
        </button>
      )}
    </HomeStatusPill>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Health: All up/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Open a service' }));
  expect(screen.queryByRole('button', { name: 'Open a service' })).toBeNull();
});
