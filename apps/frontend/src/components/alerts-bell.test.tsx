// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AlertsBell } from './alerts-bell';
import { setLocale } from '@/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows unread events and marks one read without opening the service', async () => {
  setLocale('en');
  let unread = 1;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') unread = 0;
    return new Response(
      JSON.stringify({
        unread,
        nextBefore: null,
        items: [
          {
            id: 1,
            serviceId: 5,
            serviceName: 'Example',
            kind: 'down',
            confirmedAt: 1700000000000,
            startedAt: 1700000000000,
            endedAt: null,
            reason: 'no-response',
            httpStatus: null,
            readAt: unread ? null : 1700000000000,
          },
        ],
      }),
    );
  });
  vi.stubGlobal('fetch', fetcher);
  const onService = vi.fn();
  render(<AlertsBell onService={onService} />);
  const bell = await screen.findByRole('button', { name: /1 unread/ });
  fireEvent.click(bell);
  const read = await screen.findByRole('button', { name: 'Mark notification for Example as read' });
  fireEvent.click(read);
  await waitFor(() => expect(screen.getByRole('button', { name: /none unread/ })).toBeTruthy());
  expect(onService).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledWith('/api/inbox/1/read', { method: 'POST' });
});

it('shows a recoverable error and an empty state after retrying', async () => {
  setLocale('en');
  let fail = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      fail
        ? new Response('', { status: 500 })
        : new Response(JSON.stringify({ items: [], unread: 0, nextBefore: null })),
    ),
  );
  render(<AlertsBell onService={() => {}} />);
  const bell = await screen.findByRole('button', { name: 'Could not load notifications.' });
  fireEvent.click(bell);
  expect(await screen.findByRole('alert')).toBeTruthy();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('No notifications yet.')).toBeTruthy();
});

it('shows deleted services without a link and marks all notifications as read', async () => {
  setLocale('en');
  let unread = 1;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') unread = 0;
      return new Response(
        JSON.stringify({
          unread,
          nextBefore: null,
          items: [
            {
              id: 1,
              serviceId: null,
              serviceName: 'Removed',
              kind: 'up',
              confirmedAt: 1700000000000,
              startedAt: 1699996400000,
              endedAt: 1700000000000,
              reason: 'no-response',
              httpStatus: null,
              readAt: unread ? null : 1700000000000,
            },
          ],
        }),
      );
    }),
  );
  const navigate = vi.fn();
  render(<AlertsBell onService={navigate} />);
  fireEvent.click(await screen.findByRole('button', { name: /1 unread/ }));
  expect(await screen.findByText('Removed · Service removed')).toBeTruthy();
  expect(screen.getByText('Downtime: 1 h')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /none unread/ })).toBeTruthy());
  expect(navigate).not.toHaveBeenCalled();
});
