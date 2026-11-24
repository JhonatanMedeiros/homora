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
  expect(await screen.findByText('Removed')).toBeTruthy();
  expect(screen.getByText(/Service removed/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Removed/ })).toBeNull();
  expect(screen.getByText(/Downtime: 1 h/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /none unread/ })).toBeTruthy());
  expect(navigate).not.toHaveBeenCalled();
});

it('counts pending agent proposals in the bell and links to them', async () => {
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.startsWith('/api/proposals')
        ? new Response(
            JSON.stringify([{ id: 'p1', state: 'pending', expiresAt: Date.now() + 60_000 }]),
          )
        : new Response(JSON.stringify({ items: [], unread: 0, nextBefore: null })),
    ),
  );
  const onProposals = vi.fn();
  render(<AlertsBell onService={() => {}} onProposals={onProposals} />);
  fireEvent.click(await screen.findByRole('button', { name: /1 unread/ }));
  fireEvent.click(await screen.findByRole('button', { name: /1 agent proposals/ }));
  expect(onProposals).toHaveBeenCalled();
});

it('tells the opener when an event comes from a probe', async () => {
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            unread: 1,
            nextBefore: null,
            items: [
              {
                id: 1,
                serviceId: 9,
                serviceName: 'Internet',
                kind: 'down',
                confirmedAt: 1700000000000,
                startedAt: 1700000000000,
                endedAt: null,
                reason: 'no-response',
                httpStatus: null,
                readAt: null,
                probe: true,
              },
            ],
          }),
        ),
    ),
  );
  const onService = vi.fn();
  render(<AlertsBell onService={onService} />);
  fireEvent.click(await screen.findByRole('button', { name: /1 unread/ }));
  fireEvent.click(await screen.findByRole('button', { name: /^Unread: Internet/ }));
  expect(onService).toHaveBeenCalledWith(9, true);
});

it('opens the service and marks the notification as read from the row', async () => {
  setLocale('en');
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          unread: 1,
          nextBefore: null,
          items: [
            {
              id: 7,
              serviceId: 3,
              serviceName: 'Tetto',
              kind: 'up',
              confirmedAt: 1700000000000,
              startedAt: 1699999940000,
              endedAt: 1700000000000,
              reason: 'no-response',
              httpStatus: null,
              readAt: null,
            },
          ],
        }),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  const onService = vi.fn();
  render(<AlertsBell onService={onService} />);
  fireEvent.click(await screen.findByRole('button', { name: /1 unread/ }));
  fireEvent.click(await screen.findByRole('button', { name: /^Unread: Tetto/ }));
  expect(onService).toHaveBeenCalledWith(3, false);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith('/api/inbox/7/read', { method: 'POST' }),
  );
});

it('names a probe event as a probe', async () => {
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            unread: 1,
            nextBefore: null,
            items: [
              {
                id: 1,
                serviceId: 9,
                serviceName: 'Internet',
                kind: 'up',
                confirmedAt: 1700000000000,
                startedAt: 1699999000000,
                endedAt: 1700000000000,
                reason: null,
                httpStatus: null,
                readAt: null,
                probe: true,
              },
            ],
          }),
        ),
    ),
  );
  render(<AlertsBell onService={() => {}} />);
  fireEvent.click(await screen.findByRole('button', { name: /1 unread/ }));
  expect(await screen.findByText('Recovered')).toBeTruthy();
  expect(screen.getByText('probe')).toBeTruthy();
});

it('shows one measurement alert that says it is not a service outage', async () => {
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            unread: 1,
            nextBefore: null,
            items: [
              {
                id: 1,
                serviceId: null,
                serviceName: '',
                kind: 'measurement-down',
                confirmedAt: 1700000000000,
                startedAt: 1700000000000,
                endedAt: null,
                reason: 'destination-blocked',
                httpStatus: null,
                readAt: null,
              },
            ],
          }),
        ),
    ),
  );
  render(<AlertsBell onService={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /1 unread/ }));
  expect(await screen.findByText('Monitoring')).toBeTruthy();
  expect(screen.getByText('Cannot measure')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Unread: Monitoring/ })).toBeNull();
  expect(screen.getByText(/Not a service outage/)).toBeTruthy();
  expect(screen.queryByText(/removed/i)).toBeNull();
});
