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
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Serviços',
    }),
  );
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Agentes',
    }),
  );
  expect(await screen.findByText('Adicionar “Immich”')).toBeTruthy();
  expect(screen.getByText('Aguardando você')).toBeTruthy();
  expect(screen.getByRole('tab', { name: /^Propostas\s*1$/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Aprovar e aplicar/ }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proposals/p1/review',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ approve: true }) }),
    ),
  );
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^Agentes/ }));
  expect((await screen.findAllByText('Ler serviços')).length).toBeGreaterThan(0);
});

it('does not treat unauthorized private network as service down', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/connections') return { ok: true, json: async () => [] };
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
  expect(screen.getByText('Todos os serviços monitorados no ar')).toBeTruthy();
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
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Serviços',
    }),
  );
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Agentes',
    }),
  );
  expect(await screen.findByText('Alterar “Jellyfin”')).toBeTruthy();
  expect(screen.getByText('http://antigo.local:8096/')).toBeTruthy();
  expect(screen.getByText('http://novo.local:8096/')).toBeTruthy();
  expect(screen.getByText('2 campos continuam iguais.')).toBeTruthy();
});

it('provides quick search, cards view, and collapsible groups', async () => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services')
        return {
          ok: true,
          json: async () => [
            {
              id: 1,
              name: 'Jellyfin',
              url: 'https://example.com/',
              category: 'Mídia',
              description: 'Filmes',
            },
          ],
        };
      if (url === '/api/service-status')
        return { ok: true, json: async () => ({ 1: { status: 'available' } }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByRole('link', { name: /Jellyfin/ });
  fireEvent.click(screen.getByRole('button', { name: 'Visualização' }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Cards' }));
  expect(localStorage.getItem('homora-density')).toBe('cards');
  fireEvent.click(screen.getByRole('button', { name: 'Recolher grupo Mídia' }));
  expect(screen.queryByRole('link', { name: /Jellyfin/ })).toBeNull();
  localStorage.clear();
});

it('opens service management directly and returns to dashboard', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByRole('heading', { name: 'Tudo em seu lugar.' });
  const serviceRequests = fetchMock.mock.calls.filter(([url]) => url === '/api/services').length;
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  expect(window.location.pathname).toBe('/manage/services');
  expect(screen.getByRole('heading', { name: 'Serviços e grupos' })).toBeTruthy();
  const navigation = screen.getByRole('navigation', { name: 'Gerenciamento' });
  expect(
    within(navigation).getByRole('button', { name: 'Serviços' }).getAttribute('aria-current'),
  ).toBe('page');
  expect(within(navigation).getByRole('button', { name: 'Integrações' })).toBeTruthy();
  expect(within(navigation).getByRole('button', { name: 'Agentes' })).toBeTruthy();
  fireEvent.click(within(navigation).getByRole('button', { name: 'Agentes' }));
  expect(window.location.pathname).toBe('/manage/agents');
  fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }));
  expect(screen.getByRole('heading', { name: 'Tudo em seu lugar.' })).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Gerenciamento' })).toBeNull();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/services')).toHaveLength(
    serviceRequests,
  );
});

it('opens a management route directly and responds to browser history', async () => {
  window.history.replaceState(null, '', '/manage/integrations');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Integrações' })).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Agentes',
    }),
  );
  expect(window.location.pathname).toBe('/manage/agents');
  window.history.replaceState(null, '', '/');
  fireEvent.popState(window);
  expect(await screen.findByRole('heading', { name: 'Tudo em seu lugar.' })).toBeTruthy();
  window.history.replaceState(null, '', '/manage/services');
  fireEvent.popState(window);
  expect(await screen.findByRole('heading', { name: 'Serviços e grupos' })).toBeTruthy();
});

it('redirects to login and returns to protected route after authenticating', async () => {
  window.history.replaceState(null, '', '/manage/agents');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: false }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByRole('button', { name: 'Entrar' });
  expect(window.location.pathname).toBe('/login');
  expect(new URLSearchParams(window.location.search).get('returnTo')).toBe('/manage/agents');
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@homora.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-teste' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(window.location.pathname).toBe('/manage/agents'));
});

it('rejects external redirect after login', async () => {
  window.history.replaceState(null, '', '/login?returnTo=%2F%2Fexample.com');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Tudo em seu lugar.' })).toBeTruthy();
  expect(window.location.pathname).toBe('/');
});

it('displays error for unknown pages and missing service', async () => {
  window.history.replaceState(null, '', '/manage/nao-existe');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  const view = render(<App />);
  expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeTruthy();
  view.unmount();
  window.history.replaceState(null, '', '/manage/services/99/edit');
  render(<App />);
  expect(await screen.findByText('Serviço não encontrado.')).toBeTruthy();
});

it('shows the list view by default and opens the command palette with Ctrl K', async () => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services')
        return {
          ok: true,
          json: async () => [
            {
              id: 1,
              name: 'Jellyfin',
              url: 'https://example.com/',
              category: 'Mídia',
              description: 'Filmes',
            },
          ],
        };
      if (url === '/api/service-status')
        return { ok: true, json: async () => ({ 1: { status: 'available' } }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByRole('link', { name: /Jellyfin/ });
  fireEvent.click(screen.getByRole('button', { name: 'Visualização' }));
  expect((await screen.findByRole('radio', { name: 'Lista' })).getAttribute('data-state')).toBe(
    'on',
  );
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  expect(await screen.findByPlaceholderText('Buscar serviços ou executar um comando')).toBeTruthy();
  expect(screen.getByText('Alternar tema')).toBeTruthy();
  fireEvent.click(screen.getByText('Adicionar serviço'));
  expect(window.location.pathname).toBe('/manage/services/new');
  localStorage.clear();
});

it('opens the palette from the header button and goes to a card inside a collapsed group', async () => {
  localStorage.clear();
  localStorage.setItem('homora-collapsed-groups', JSON.stringify(['Infra']));
  window.history.replaceState(null, '', '/');
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services')
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Wiki', url: 'http://wiki.test/', category: 'Casa', description: '' },
            { id: 2, name: 'Proxmox', url: 'http://pve.test/', category: 'Infra', description: '' },
          ],
        };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByRole('link', { name: /Wiki/ });
  expect(document.getElementById('service-2')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Buscar ou executar um comando' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ir para o card de Proxmox' }));
  await waitFor(() => expect(document.getElementById('service-2')?.dataset.highlight).toBe('true'));
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  // The expansion is temporary: the saved preference is kept.
  expect(localStorage.getItem('homora-collapsed-groups')).toContain('Infra');
  await waitFor(
    () => expect(document.getElementById('service-2')?.dataset.highlight).toBeUndefined(),
    {
      timeout: 3000,
    },
  );
  localStorage.clear();
});

it('opens the new service form straight from the empty dashboard', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar primeiro serviço' }));
  expect(window.location.pathname).toBe('/manage/services/new');
  expect(await screen.findByRole('form', { name: 'Novo serviço' })).toBeTruthy();
});
