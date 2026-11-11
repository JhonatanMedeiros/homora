// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionsList } from './sessions-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const sessions = [
  {
    id: 'a',
    browser: 'Chrome',
    os: 'Linux',
    ipAddress: '192.168.1.24',
    createdAt: '2026-11-11T09:12:00.000Z',
    expiresAt: '2026-11-11T17:12:00.000Z',
    current: true,
  },
  {
    id: 'b',
    browser: 'Safari',
    os: 'iPhone',
    ipAddress: '192.168.1.31',
    createdAt: '2026-11-11T06:05:00.000Z',
    expiresAt: '2026-11-11T14:05:00.000Z',
    current: false,
  },
];

it('ends another session only after a second click and never offers to end this one', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === 'POST' ? new Response('{"ok":true}') : new Response(JSON.stringify(sessions)),
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<SessionsList refreshKey={0} />);
  await screen.findByText('Safari em iPhone');
  expect(screen.getByText('Esta sessão')).toBeTruthy();
  const end = screen.getAllByRole('button', { name: 'Encerrar' });
  expect(end).toHaveLength(1);
  fireEvent.click(end[0]!);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/account/sessions/b/revoke', { method: 'POST' }),
  );
});
