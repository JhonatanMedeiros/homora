// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '@/App';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it('renders without a session and calls only the public endpoint', async () => {
  window.history.replaceState(null, '', '/status');
  const fetchMock = vi.fn(async (url: string) => ({
    url,
    ok: true,
    status: 200,
    json: async () => ({
      title: 'Meu lab',
      updatedAt: new Date().toISOString(),
      services: [
        {
          name: 'Jellyfin',
          category: 'Mídia',
          status: 'up',
          checkedAt: new Date().toISOString(),
          uptime: 99.5,
          bars: Array.from({ length: 24 }, () => 'up'),
        },
      ],
    }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(await screen.findByText('Jellyfin')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1, name: 'Meu lab' })).toBeTruthy();
  expect(screen.getByText('Todos os sistemas operacionais')).toBeTruthy();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/public/status']);
});

it('shows a neutral message when the page is closed', async () => {
  window.history.replaceState(null, '', '/status');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
  );
  render(<App />);
  expect(await screen.findByText('Esta página não está disponível.')).toBeTruthy();
});

it('explains when an access gateway redirects the request', async () => {
  window.history.replaceState(null, '', '/status');
  const fetchMock = vi.fn(async (...args: [string, RequestInit?]) => ({
    ok: false,
    status: 0,
    type: 'opaqueredirect',
    args,
    json: async () => ({}),
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(await screen.findByText(/portão de login/)).toBeTruthy();
  const init = fetchMock.mock.calls[0][1];
  expect(init?.redirect).toBe('manual');
  expect(init?.credentials).not.toBe('omit');
});
