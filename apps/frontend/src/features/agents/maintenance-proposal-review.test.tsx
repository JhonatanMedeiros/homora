// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ManagedProposalChange } from './managed-proposal-change';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('offers review of a proposed window without applying or approving it', async () => {
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(url === '/api/services' ? [{ id: 1, name: 'DNS' }] : { windows: [] }),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(
    <ManagedProposalChange
      diff={{
        kind: 'managed',
        change: {
          kind: 'maintenance',
          change: {
            op: 'create',
            serviceId: 1,
            startsAt: 100,
            endsAt: 200,
            note: '<script>hostile</script>',
          },
        },
      }}
    />,
  );
  expect(screen.getByText('<script>hostile</script>')).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /revisar preparação|review preparation/i }));
  expect(await screen.findByText(/nenhuma sobreposição|no overlap found/i)).toBeTruthy();
  expect(
    fetcher.mock.calls.every(([url]) =>
      ['/api/services', '/api/services/1/maintenance'].includes(url),
    ),
  ).toBe(true);
});
