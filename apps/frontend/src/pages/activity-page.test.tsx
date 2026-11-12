// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ActivityPage } from './activity-page';
import type { ActivityEvent } from '@/features/activity/activity-model';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const event = (id: number): ActivityEvent => ({
  id,
  createdAt: Date.now(),
  kind: 'access',
  action: 'logout',
  outcome: 'success',
  actor: { type: 'user', name: `User ${id}` },
  detail: null,
  ipAddress: null,
  proposalId: null,
});

const stubFetch = (pages: { events: ActivityEvent[]; nextBefore: number | null }[]) => {
  const fetchMock = vi.fn(async () => {
    const page = pages.shift() ?? { events: [], nextBefore: null };
    return new Response(JSON.stringify(page), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ActivityPage />
    </MemoryRouter>,
  );

it('shows the empty state and the retention notice', async () => {
  stubFetch([{ events: [], nextBefore: null }]);
  renderPage();
  expect(await screen.findByText(/Nenhuma atividade ainda|No activity yet/)).toBeTruthy();
  expect(screen.getByText(/365 dias|365 days/)).toBeTruthy();
});

it('loads more events with the cursor and hides the button at the end', async () => {
  const fetchMock = stubFetch([
    { events: [event(3), event(2)], nextBefore: 2 },
    { events: [event(1)], nextBefore: null },
  ]);
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: /Carregar mais|Load more/ }));
  await waitFor(() => expect(screen.getByText('User 1')).toBeTruthy());
  const calls = fetchMock.mock.calls as unknown as [string][];
  expect(calls[1]?.[0]).toContain('before=2');
  expect(screen.queryByRole('button', { name: /Carregar mais|Load more/ })).toBeNull();
});
