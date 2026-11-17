// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { App } from './App';

afterEach(() => {
  cleanup();
  // Toasts live in a module-level store and would leak into the next test.
  toast.dismiss();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it('shows pending proposals in clear language and approves with a single click', async () => {
  const proposals = [
    {
      id: 'p1',
      author: 'a1',
      state: 'pending',
      expiresAt: Date.now() + 600_000,
      diff: JSON.stringify({
        op: 'create',
        service: { name: 'Immich', url: 'http://x.local/', category: 'Mídia' },
      }),
    },
  ];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/agents')
      return {
        ok: true,
        json: async () => [
          { id: 'a1', name: 'Assistente', scopes: '["services:read"]', revokedAt: null },
        ],
      };
    if (url === '/api/proposals') return { ok: true, json: async () => proposals };
    if (url === '/api/proposals/p1/review' && init?.method === 'POST')
      return { ok: true, json: async () => ({}) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByRole('heading', { name: 'Tudo em seu lugar.' });
  fireEvent.keyDown(screen.getByRole('button', { name: /Menu da conta de/ }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Agentes',
    }),
  );
  expect(await screen.findByRole('heading', { name: 'Adicionar “Immich”' })).toBeTruthy();
  expect(screen.getAllByText('Aguardando você').length).toBeGreaterThan(0);
  expect(screen.getByRole('tab', { name: /^Propostas\s*1$/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Aprovar e aplicar/ }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proposals/p1/review',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ approve: true }) }),
    ),
  );
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^Agentes/ }));
  expect(await screen.findByRole('button', { name: /^Abrir / })).toBeTruthy();
});

it('does not treat unauthorized private network as service down', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/connections' || url === '/api/probes')
        return { ok: true, json: async () => [] };
      if (url === '/api/service-status')
        return {
          ok: true,
          json: async () => ({
            1: { status: 'unavailable', lastAttempt: '2026-11-10T12:30:00.000Z' },
            2: { status: 'available', lastAttempt: '2026-11-10T12:30:00.000Z' },
          }),
        };
      if (url === '/api/groups') return { ok: true, json: async () => [] };
      return {
        ok: true,
        json: async () => [
          { id: 1, name: 'Casa', url: 'http://192.168.1.10:80/', category: 'A', description: '' },
          { id: 2, name: 'Web', url: 'https://example.com/', category: 'A', description: '' },
        ],
      };
    }),
  );
  render(<App />);
  expect(await screen.findByText('Sem monitoramento')).toBeTruthy();
  expect(screen.queryByText('Fora do ar')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Saúde: Monitoramento parcial/ }));
  expect(await screen.findByText('Todos os serviços monitorados no ar')).toBeTruthy();
  expect(screen.getByText(/1 serviço sem monitoramento/)).toBeTruthy();
});

it('shows before and after of an update proposal', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/agents') return { ok: true, json: async () => [] };
      if (url === '/api/proposals')
        return {
          ok: true,
          json: async () => [
            {
              id: 'p2',
              author: 'a1',
              state: 'pending',
              expiresAt: Date.now() + 600_000,
              diff: JSON.stringify({
                op: 'update',
                id: 5,
                service: {
                  name: 'Jellyfin',
                  url: 'http://novo.local:8096/',
                  category: 'Mídia',
                  description: '',
                },
              }),
            },
          ],
        };
      if (url === '/api/connections') return { ok: true, json: async () => [] };
      if (url === '/api/services')
        return {
          ok: true,
          json: async () => [
            {
              id: 5,
              name: 'Jellyfin',
              url: 'http://antigo.local:8096/',
              category: 'Mídia',
              description: '',
            },
          ],
        };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByRole('link', { name: /Jellyfin/ });
  fireEvent.keyDown(screen.getByRole('button', { name: /Menu da conta de/ }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Agentes',
    }),
  );
  expect(await screen.findByRole('heading', { name: 'Alterar “Jellyfin”' })).toBeTruthy();
  // The part that changed is emphasized, so a line is matched by its whole text.
  const line = (text: string) =>
    screen.getByText((_, node) => node?.tagName === 'SPAN' && node.textContent === text);
  expect(line('−Antes:http://antigo.local:8096/')).toBeTruthy();
  expect(line('+Depois:http://novo.local:8096/')).toBeTruthy();
  expect(screen.getByText('2 campos continuam iguais.')).toBeTruthy();
});
