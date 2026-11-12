// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PushSources } from './push-sources';
import { setLocale } from '@/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('creates a source, shows its token once and imports only reviewed suggestions', async () => {
  setLocale('pt-BR');
  const calls: { url: string; body?: string }[] = [];
  let created = false;
  const source = {
    id: 'a'.repeat(32),
    name: 'LXC',
    revoked: 0,
    receivedAt: Date.now(),
    stale: false,
  };
  const preview = {
    source: { id: source.id, version: 2 },
    version: 7,
    entries: [{ id: 'a'.repeat(12), container: 'app' }],
    plan: {
      services: [{ name: 'App', group: 'Home', url: 'https://app.example', status: 'new' }],
      groups: [],
      issues: [],
      summary: { newGroups: 0, newServices: 1, duplicates: 0, errors: 0, warnings: 0 },
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      let body: unknown = {};
      if (url === '/api/discovery/sources' && init?.method === 'POST') {
        created = true;
        body = { id: source.id, token: 'synthetic-token' };
      } else if (url === '/api/discovery/sources') body = { sources: created ? [source] : [] };
      else if (url.endsWith('/suggestions')) body = preview;
      else if (url.endsWith('/import')) body = { created: 1 };
      return { ok: true, status: 200, json: async () => body };
    }),
  );
  const onImported = vi.fn();
  render(<PushSources onImported={onImported} />);
  fireEvent.change(screen.getByLabelText('Nome da fonte'), { target: { value: 'LXC' } });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar fonte' }));
  expect(await screen.findByText('synthetic-token')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Já salvei o token' }));
  expect(screen.queryByText('synthetic-token')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Revisar sugestões' }));
  fireEvent.click(await screen.findByRole('checkbox', { name: /App · Home/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar selecionados (1)' }));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const request = calls.find((call) => call.url.endsWith('/import'));
  expect(JSON.parse(request?.body ?? '{}')).toEqual({
    ids: ['a'.repeat(12)],
    inventoryVersion: 2,
    expectedVersion: 7,
  });
});

it('requires an explicit dialog before rotating and cannot rotate a revoked source', async () => {
  setLocale('pt-BR');
  const sources = [
    { id: 'a'.repeat(32), name: 'Ativa', revoked: 0, receivedAt: null, stale: false },
    { id: 'b'.repeat(32), name: 'Fonte antiga', revoked: 1, receivedAt: null, stale: false },
  ];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith('/rotate') && init?.method === 'POST'
        ? { token: 'new-synthetic-token' }
        : { sources },
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<PushSources onImported={() => {}} />);
  await screen.findByText('Ativa');
  const { within } = await import('@testing-library/react');
  const active = screen.getByText('Ativa').closest('li');
  const revoked = screen.getByText('Fonte antiga').closest('li');
  if (!active || !revoked) throw new Error('missing source');
  expect(
    within(revoked).getByRole('button', { name: 'Gerar novo token' }).hasAttribute('disabled'),
  ).toBe(true);
  fireEvent.click(within(active).getByRole('button', { name: 'Gerar novo token' }));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/rotate'))).toBe(false);
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
  );
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/rotate'))).toBe(false);
  fireEvent.click(within(active).getByRole('button', { name: 'Gerar novo token' }));
  fireEvent.click(
    within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar novo token' }),
  );
  expect(await screen.findByText('new-synthetic-token')).toBeTruthy();
});
