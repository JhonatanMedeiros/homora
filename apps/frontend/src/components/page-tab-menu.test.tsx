// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PageTabMenu } from './page-tab-menu';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const rows = [
  { id: 1, name: 'Home', position: 0, groups: 2, widgets: 0 },
  { id: 2, name: 'Network', position: 1, groups: 0, widgets: 0 },
];

function stub(calls: [string, RequestInit | undefined][]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (init?.method === 'DELETE') return new Response(JSON.stringify([rows[1]]));
      return new Response(JSON.stringify(rows));
    }),
  );
}

async function open() {
  fireEvent.keyDown(screen.getByRole('button', { name: /Menu da página: Home/ }), {
    key: 'Enter',
  });
  await screen.findByRole('menuitem', { name: /Excluir/ });
}

it('asks where the groups go before deleting a page that has them, then deletes', async () => {
  const calls: [string, RequestInit | undefined][] = [];
  stub(calls);
  const onChanged = vi.fn();
  render(<PageTabMenu page={rows[0]!} onChanged={onChanged} />);
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  await open();
  fireEvent.click(screen.getByRole('menuitem', { name: /Excluir/ }));
  expect(await screen.findByLabelText('Mover os grupos para')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  const del = calls.find(([, init]) => init?.method === 'DELETE');
  expect(del?.[0]).toBe('/api/pages/1?moveTo=2');
});

it('cannot move the first page earlier', async () => {
  stub([]);
  render(<PageTabMenu page={rows[0]!} onChanged={() => {}} />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await open();
  await waitFor(() =>
    expect(
      screen.getByRole('menuitem', { name: /Mover para antes/ }).getAttribute('aria-disabled'),
    ).toBe('true'),
  );
});
