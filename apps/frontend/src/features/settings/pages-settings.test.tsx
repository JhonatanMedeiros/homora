// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PagesSettings } from './pages-settings';
import { setLocale } from '@/i18n';

let rows = [
  { id: 1, name: 'Home', position: 0, groups: 2 },
  { id: 2, name: 'Lab', position: 1, groups: 0 },
];
const calls: { url: string; method: string; body?: string }[] = [];
beforeEach(() => {
  setLocale('en');
  rows = [
    { id: 1, name: 'Home', position: 0, groups: 2 },
    { id: 2, name: 'Lab', position: 1, groups: 0 },
  ];
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body as string | undefined });
      if (method === 'POST') {
        rows = [
          ...rows,
          { id: 3, name: JSON.parse(init?.body as string).name, position: 2, groups: 0 },
        ];
      }
      if (method === 'DELETE') rows = rows.filter((row) => row.id !== 2);
      return new Response(JSON.stringify(rows));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('lists the pages and adds one', async () => {
  const onChanged = vi.fn();
  render(<PagesSettings onChanged={onChanged} />);
  await screen.findByText('Lab');
  fireEvent.change(screen.getByPlaceholderText('Page name'), { target: { value: 'Media' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add page' }));
  await screen.findByText('Media');
  expect(calls.find((call) => call.method === 'POST')?.body).toBe('{"name":"Media"}');
  expect(onChanged).toHaveBeenCalled();
});

it('reorders with the arrow buttons', async () => {
  render(<PagesSettings />);
  await screen.findByText('Lab');
  expect((screen.getByRole('button', { name: 'Move Home up' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Move Lab up' }));
  await waitFor(() => expect(calls.some((call) => call.url === '/api/pages/order')).toBe(true));
  expect(calls.find((call) => call.url === '/api/pages/order')?.body).toBe('{"ids":[2,1]}');
});

it('deletes an empty page after confirmation', async () => {
  render(<PagesSettings />);
  await screen.findByText('Lab');
  fireEvent.click(screen.getByRole('button', { name: 'Delete Lab' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
  expect(calls.find((call) => call.method === 'DELETE')?.url).toBe('/api/pages/2');
});
