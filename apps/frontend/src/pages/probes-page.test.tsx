// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Probe } from '@homora/shared';
import { ProbesPage } from './probes-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const wan: Probe = {
  id: 7,
  name: 'WAN',
  address: 'http://1.1.1.1',
  checkType: 'ping',
  checkInterval: null,
  expectedStatus: null,
  checkMatch: null,
  allowPrivate: false,
  isPublic: false,
};

/** Serves `probes` and records every write; a failing write answers with the given body. */
function stub(probes: Probe[], failWith?: { status: number; body: unknown }) {
  const writes: { url: string; method: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      writes.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (failWith) return new Response(JSON.stringify(failWith.body), { status: failWith.status });
      if (method === 'DELETE') {
        probes.splice(0, probes.length);
        return new Response(null, { status: 204 });
      }
      if (method === 'POST') probes.push({ ...wan, ...(writes.at(-1)!.body as object), id: 8 });
      return new Response(JSON.stringify(probes.at(-1) ?? wan), { status: 200 });
    }
    if (url.startsWith('/api/probes')) return new Response(JSON.stringify(probes), { status: 200 });
    if (url.startsWith('/api/service-status'))
      return new Response(
        JSON.stringify({ 7: { status: 'unavailable', lastAttempt: null, reason: 'no-response' } }),
        { status: 200 },
      );
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return writes;
}

it('offers examples when nothing is monitored without a card, and starts the form from one', async () => {
  stub([]);
  render(<ProbesPage />);
  expect(
    await screen.findByText(
      /Nada é monitorado sem um card ainda|Nothing is monitored without a card yet/,
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Internet \(ping 1\.1\.1\.1\)/ }));
  const dialog = await screen.findByRole('dialog');
  expect((within(dialog).getByLabelText(/Endereço|Address/) as HTMLInputElement).value).toBe(
    'http://1.1.1.1',
  );
  expect((within(dialog).getByLabelText(/Nome|Name/) as HTMLInputElement).value).toBe('Internet');
});

it('lists a probe with its state and address', async () => {
  stub([wan]);
  render(<ProbesPage />);
  const row = await screen.findByText('WAN');
  const item = row.closest('li')!;
  expect(within(item).getByText('http://1.1.1.1')).toBeTruthy();
  await waitFor(() => expect(within(item).getByText(/Fora do ar|Offline/)).toBeTruthy());
});

it('sends the form and shows the reason the server refused it', async () => {
  const writes = stub([], { status: 400, body: { code: 'invalid-probe-address' } });
  render(<ProbesPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Internet \(ping 1\.1\.1\.1\)/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Endereço|Address/), {
    target: { value: 'http://9.9.9.9' },
  });
  fireEvent.submit(dialog.querySelector('form')!);
  expect(
    await within(dialog).findByText(/endereço HTTP ou HTTPS|HTTP or HTTPS address/),
  ).toBeTruthy();
  expect(writes[0]).toMatchObject({
    url: '/api/probes',
    method: 'POST',
    body: { name: 'Internet', address: 'http://9.9.9.9', checkType: 'ping', allowPrivate: false },
  });
});

it('asks before deleting and removes the probe', async () => {
  const writes = stub([wan]);
  render(<ProbesPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Excluir WAN|Delete WAN/ }));
  const confirm = await screen.findByRole('alertdialog');
  expect(writes).toEqual([]);
  fireEvent.click(within(confirm).getByRole('button', { name: /Remover|Remove/ }));
  await waitFor(() =>
    expect(writes).toEqual([{ url: '/api/probes/7', method: 'DELETE', body: null }]),
  );
});
