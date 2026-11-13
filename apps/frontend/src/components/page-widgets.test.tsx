// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PageWidgets } from './page-widgets';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows a clock without querying a connection and opens a prefilled creation form', async () => {
  const fetcher = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url === '/api/page-widgets'
            ? [
                {
                  id: 1,
                  pageId: 1,
                  type: 'clock',
                  name: 'Office',
                  config: { hourFormat: '24h', timeZone: 'UTC', seconds: false, date: true },
                  connectionId: null,
                  position: 0,
                  version: 1,
                },
              ]
            : [],
        ),
      ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<PageWidgets pageId={1} pages={[{ id: 1, name: 'Home', position: 0, groups: 0 }]} />);
  await screen.findByText('Office');
  expect(document.querySelector('time')).toBeTruthy();
  expect(fetcher.mock.calls.some(([url]) => url.includes('/data'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar widget' }));
  expect(await screen.findByLabelText('Nome (opcional)')).toBeTruthy();
});

it('isolates a failed connection from a clock on the same page', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/page-widgets')
        return new Response(
          JSON.stringify([
            {
              id: 1,
              pageId: 1,
              type: 'clock',
              name: 'Clock',
              config: { hourFormat: 'auto', timeZone: '', seconds: false, date: true },
              connectionId: null,
              position: 0,
              version: 1,
            },
            {
              id: 2,
              pageId: 1,
              type: 'proxmox',
              name: 'Lab',
              config: {},
              connectionId: 2,
              position: 1,
              version: 1,
            },
          ]),
        );
      if (url === '/api/connections') return new Response('[]');
      return new Response('{}', { status: 503 });
    }),
  );
  render(<PageWidgets pageId={1} pages={[{ id: 1, name: 'Home', position: 0, groups: 0 }]} />);
  await waitFor(() => expect(screen.getByText('Clock')).toBeTruthy());
  await waitFor(() => expect(screen.getByText('Dados indisponíveis')).toBeTruthy());
  expect(document.querySelector('time')).toBeTruthy();
});

it('removes a widget after confirmation without sending an empty JSON body', async () => {
  const widget = {
    id: 1,
    pageId: 1,
    type: 'clock',
    name: 'Office',
    config: { hourFormat: '24h', timeZone: 'UTC', seconds: false, date: true },
    connectionId: null,
    position: 0,
    version: 1,
  };
  let removed = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      removed = true;
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(url === '/api/page-widgets' && !removed ? [widget] : []));
  });
  vi.stubGlobal('fetch', fetcher);
  render(<PageWidgets pageId={1} pages={[{ id: 1, name: 'Home', position: 0, groups: 0 }]} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remover widget: Office' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
  await waitFor(() => expect(screen.queryByText('Office')).toBeNull());
  expect(fetcher).toHaveBeenCalledWith('/api/page-widgets/1', { method: 'DELETE' });
});
