// @vitest-environment happy-dom
import { Toaster, toast } from 'sonner';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Discovery } from './discovery';

beforeEach(() => {
  render(<Toaster />);
});

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.unstubAllGlobals();
});

const found = {
  enabled: true,
  scanned: 5,
  version: 7,
  entries: [
    { id: 'aaaaaaaaaaa1', container: 'jellyfin', group: 'Media', url: 'http://192.168.1.10:8096/' },
    { id: 'aaaaaaaaaaa2', container: 'sonarr', group: 'Media', url: 'http://192.168.1.10:8989/' },
  ],
  plan: {
    groups: [{ name: 'Media', status: 'new' }],
    services: [
      { group: 'Media', name: 'jellyfin', url: 'http://192.168.1.10:8096/', status: 'new' },
      { group: 'Media', name: 'Sonarr', url: 'http://192.168.1.10:8989/', status: 'duplicate' },
    ],
    issues: [{ path: 'containers[3]', code: 'invalid-url', severity: 'error' }],
    summary: { newGroups: 1, newServices: 1, duplicates: 1, errors: 1, warnings: 0 },
  },
};
const ok = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

it('explains how to enable discovery when disabled', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ok({ enabled: false })),
  );
  render(<Discovery onImported={() => {}} />);
  expect(await screen.findByText(/Desativada\. Defina HOMORA_DOCKER_HOST/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Adicionar selecionados/ })).toBeNull();
});

it('lists suggestions, reviews and edits before confirming, then reports each result', async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fingerprint = 'f'.repeat(64);
  const created = { id: 'aaaaaaaaaaa1', container: 'jellyfin', status: 'created' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      calls.push({ url, body });
      if (url === '/api/discovery') return ok(found);
      return body.preview
        ? ok({ version: 7, fingerprint, plan: found.plan, results: [created] })
        : ok({ created: 1, plan: found.plan, results: [created] });
    }),
  );
  const onImported = vi.fn();
  render(<Discovery onImported={onImported} />);
  const boxes = await screen.findAllByRole('checkbox');
  expect(screen.getByText('Contêiner: jellyfin')).toBeTruthy();
  // [0] select all or jellyfin (new), duplicate stays disabled
  const jellyfin = screen.getByRole('checkbox', { name: /jellyfin/ });
  expect(
    boxes.some((box) => box.hasAttribute('disabled') || box.dataset.disabled !== undefined),
  ).toBe(true);
  expect(screen.getByRole('button', { name: 'Revisar e adicionar' }).hasAttribute('disabled')).toBe(
    true,
  );

  fireEvent.click(jellyfin);
  fireEvent.click(screen.getByRole('button', { name: 'Revisar e adicionar (1)' }));
  // Nothing is created by opening the review; the server only evaluates it
  const name = await screen.findByLabelText('Nome');
  fireEvent.change(name, { target: { value: 'Cinema' } });
  expect(calls.some((call) => call.url === '/api/discovery/import' && !call.body.preview)).toBe(
    false,
  );
  fireEvent.click(await screen.findByRole('checkbox', { name: /rede privada nos cards/ }));
  const confirm = await screen.findByRole('button', { name: 'Adicionar 1 cards' });
  await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const post = calls.filter((call) => call.url === '/api/discovery/import' && !call.body.preview);
  expect(post).toHaveLength(1);
  expect(post[0].body).toEqual({
    ids: ['aaaaaaaaaaa1'],
    overrides: { aaaaaaaaaaa1: { name: 'Cinema' } },
    expectedVersion: 7,
    fingerprint,
    keepPrivate: true,
  });
  expect(await screen.findByText('Concluído: 1 criados, 0 não criados.')).toBeTruthy();
});

it('shows containers without an address label as information and flags unreachable addresses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      ok({
        ...found,
        entries: [{ ...found.entries[0], url: 'http://localhost:8096/', note: 'loopback' }],
        skipped: [{ id: 'aaaaaaaaaaa3', container: 'db' }],
        skippedTotal: 3,
      }),
    ),
  );
  render(<Discovery onImported={() => {}} />);
  expect(await screen.findByText(/localhost se refere ao dispositivo/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Contêineres sem label de endereço \(3\)/ }));
  expect(await screen.findByText('db')).toBeTruthy();
  expect(screen.getByText('E mais 2.')).toBeTruthy();
  expect(screen.getByText(/não adivinha endereços nem portas/)).toBeTruthy();
});

it('asks for a new review when the data changed before confirmation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      if (url === '/api/discovery') return ok(found);
      if (body.preview)
        return ok({
          version: 7,
          fingerprint: 'f'.repeat(64),
          plan: found.plan,
          results: [{ id: 'aaaaaaaaaaa1', container: 'jellyfin', status: 'created' }],
        });
      return ok({ code: 'discovery-stale', error: 'x' }, 409);
    }),
  );
  const onImported = vi.fn();
  render(<Discovery onImported={onImported} />);
  fireEvent.click(await screen.findByRole('checkbox', { name: /jellyfin/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar e adicionar (1)' }));
  const confirm = await screen.findByRole('button', { name: 'Adicionar 1 cards' });
  await waitFor(() => expect(confirm.hasAttribute('disabled')).toBe(false));
  fireEvent.click(confirm);
  expect(await screen.findByText(/Os dados mudaram durante a revisão/)).toBeTruthy();
  expect(onImported).not.toHaveBeenCalled();
});

it('displays translated error when Docker daemon does not respond', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ok({ code: 'docker-unavailable', error: 'x' }, 502)),
  );
  render(<Discovery onImported={() => {}} />);
  expect(await screen.findByText(/Não foi possível ler os contêineres do Docker/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ler novamente' })).toBeTruthy();
});
