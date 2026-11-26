// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WidgetHostProvider, type WidgetHost } from '../../../ui/host.js';
import { widgetUI } from './index.js';
import { en } from '../messages.js';

afterEach(cleanup);
function show(readSource?: WidgetHost['readSource'], connectionId?: number) {
  const View = widgetUI.View;
  return render(
    <WidgetHostProvider
      value={{
        locale: 'en-US',
        connectionId,
        readSource,
        t: (key) => en[key as keyof typeof en] ?? key,
      }}
    >
      <View config={{ limit: 10 }} />
    </WidgetHostProvider>,
  );
}
it('shows states and the source timestamp with a stale warning', async () => {
  const readSource: NonNullable<WidgetHost['readSource']> = vi.fn(
    async <T,>() =>
      ({
        checks: [
          { name: 'Database backup', status: 'down', lastPing: '2026-01-01T00:00:00Z' },
          { name: 'New job', status: 'new', lastPing: null },
        ],
        total: 2,
        fetchedAt: 1000,
        stale: true,
      }) as T,
  );
  show(readSource, 3);
  expect(await screen.findByText('Database backup')).toBeTruthy();
  expect(screen.getByText('Down')).toBeTruthy();
  expect(screen.getByText('New')).toBeTruthy();
  expect(screen.getByText('Showing the last successful reading.')).toBeTruthy();
  expect(readSource).toHaveBeenCalledWith(
    'healthchecks-jobs',
    { connectionId: 3 },
    expect.any(AbortSignal),
  );
});
it('distinguishes an empty project, connection errors and missing configuration', async () => {
  const empty: NonNullable<WidgetHost['readSource']> = vi.fn(
    async <T,>() => ({ checks: [], total: 0, fetchedAt: 1000, stale: false }) as T,
  );
  show(empty, 3);
  expect(await screen.findByText('No checks in this project.')).toBeTruthy();
  cleanup();
  const failed: NonNullable<WidgetHost['readSource']> = vi.fn(async () => {
    throw new Error();
  });
  show(failed, 3);
  expect(await screen.findByRole('alert')).toBeTruthy();
  cleanup();
  show();
  expect(screen.getByText('Choose a Healthchecks connection.')).toBeTruthy();
});
