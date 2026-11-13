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

it('lists suggestions, allows checking only new items, and sends selected IDs', async () => {
  const calls: { url: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      return url === '/api/discovery' ? ok(found) : ok({ created: 1, plan: found.plan });
    }),
  );
  const onImported = vi.fn();
  render(<Discovery onImported={onImported} />);
  const boxes = await screen.findAllByRole('checkbox');
  expect(screen.getByText('Contêiner: jellyfin')).toBeTruthy();
  // [0] jellyfin (new), [1] sonarr (duplicate, disabled), [2] private network
  expect(boxes[1].hasAttribute('disabled') || boxes[1].getAttribute('data-disabled') !== null).toBe(
    true,
  );
  expect(
    screen.getByRole('button', { name: 'Adicionar selecionados' }).hasAttribute('disabled'),
  ).toBe(true);

  fireEvent.click(boxes[0]);
  fireEvent.click(screen.getByRole('checkbox', { name: /rede privada nos cards selecionados/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar selecionados (1)' }));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const post = calls.find((call) => call.url === '/api/discovery/import');
  expect(JSON.parse(post?.body ?? '{}')).toEqual({
    ids: ['aaaaaaaaaaa1'],
    keepPrivate: true,
    expectedVersion: 7,
  });
  expect(await screen.findByText('1 cards adicionados.')).toBeTruthy();
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
