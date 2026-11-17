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

function stubSignedIn() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/account')
        return { ok: true, json: async () => ({ name: 'Maria', email: 'maria@example.com' }) };
      if (url === '/api/account/sessions') return { ok: true, json: async () => [] };
      return { ok: true, json: async () => [] };
    }),
  );
}

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
  fireEvent.keyDown(screen.getByRole('button', { name: /Menu da conta de/ }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Gerenciar' }));
  expect(window.location.pathname).toBe('/manage/integrations');
  const navigation = screen.getByRole('navigation', { name: 'Gerenciamento' });
  // Services and groups are managed on the Home (Organize), so they are not a section here.
  expect(within(navigation).queryByRole('button', { name: 'Serviços' })).toBeNull();
  expect(
    within(navigation).getByRole('button', { name: 'Integrações' }).getAttribute('aria-current'),
  ).toBe('page');
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
  // The old services list sends people to the Home.
  window.history.replaceState(null, '', '/manage/services');
  fireEvent.popState(window);
  expect(await screen.findByRole('heading', { name: 'Tudo em seu lugar.' })).toBeTruthy();
  await waitFor(() => expect(window.location.pathname).toBe('/'));
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

it('shows compact tiles by default and opens the command palette with Ctrl K', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Exibição' }));
  expect((await screen.findByRole('radio', { name: 'Compacto' })).dataset.state).toBe('on');
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
  expect(document.querySelector('#service-2')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Buscar ou executar um comando' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ir para o card de Proxmox' }));
  await waitFor(() =>
    expect(document.querySelector<HTMLElement>('#service-2')?.dataset.highlight).toBe('true'),
  );
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  // The expansion is temporary: the saved preference is kept.
  expect(localStorage.getItem('homora-collapsed-groups')).toContain('Infra');
  await waitFor(
    () =>
      expect(document.querySelector<HTMLElement>('#service-2')?.dataset.highlight).toBeUndefined(),
    {
      timeout: 3000,
    },
  );
  localStorage.clear();
});

it('reaches Manage from the user menu, which is how phones open it', async () => {
  stubSignedIn();
  window.history.replaceState(null, '', '/');
  render(<App />);
  await screen.findByRole('heading', { name: 'Tudo em seu lugar.' });
  fireEvent.keyDown(await screen.findByRole('button', { name: /Menu da conta de/ }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Gerenciar' }));
  await waitFor(() => expect(window.location.pathname).toBe('/manage/integrations'));
});

it('opens the account from the user menu as its own page, outside the management area', async () => {
  stubSignedIn();
  render(<App />);
  await screen.findByRole('heading', { name: 'Tudo em seu lugar.' });
  fireEvent.keyDown(await screen.findByRole('button', { name: /Menu da conta de/ }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Conta' }));
  expect(await screen.findByRole('heading', { name: 'Conta' })).toBeTruthy();
  expect(window.location.pathname).toBe('/account');
  // No management sidebar: only a way back.
  expect(screen.queryByRole('navigation', { name: 'Gerenciamento' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar ao início' }));
  expect(await screen.findByRole('heading', { name: 'Tudo em seu lugar.' })).toBeTruthy();
  expect(window.location.pathname).toBe('/');
});

it('keeps old /manage/account links working by redirecting to /account', async () => {
  stubSignedIn();
  window.history.replaceState(null, '', '/manage/account');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Conta' })).toBeTruthy();
  await waitFor(() => expect(window.location.pathname).toBe('/account'));
});

it('does not list the account among the management sections', async () => {
  stubSignedIn();
  window.history.replaceState(null, '', '/manage/integrations');
  render(<App />);
  const nav = await screen.findByRole('navigation', { name: 'Gerenciamento' });
  expect(within(nav).queryByRole('button', { name: 'Conta' })).toBeNull();
  for (const name of ['Integrações', 'Agentes', 'Atividade', 'Configurações'])
    expect(within(nav).getByRole('button', { name })).toBeTruthy();
});

it('lists the settings subpages and opens one from its own URL', async () => {
  stubSignedIn();
  window.history.replaceState(null, '', '/manage/settings');
  render(<App />);
  const nav = await screen.findByRole('navigation', { name: 'Configurações' });
  for (const name of [
    /Aparência/,
    /Início e páginas/,
    /Barra superior e atalhos/,
    /Alertas/,
    /Status público/,
    /Exportar e importar/,
  ])
    expect(within(nav).getAllByRole('link', { name }).length).toBeGreaterThan(0);
  expect(within(nav).queryByRole('link', { name: /Descoberta Docker/ })).toBeNull();
  fireEvent.click(within(nav).getAllByRole('link', { name: /Exportar e importar/ })[0]);
  expect(window.location.pathname).toBe('/manage/settings/backup');
  expect(await screen.findByRole('heading', { name: 'Exportar' })).toBeTruthy();
  expect(
    within(screen.getByRole('navigation', { name: 'Configurações' }))
      .getAllByRole('link', { name: /Exportar e importar/ })
      .some((link) => link.getAttribute('aria-current') === 'page'),
  ).toBe(true);
});

it('keeps old settings links working', async () => {
  stubSignedIn();
  window.history.replaceState(null, '', '/manage/settings/notifications');
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe('/manage/settings/alerts'));
  cleanup();
  window.history.replaceState(null, '', '/manage/settings/discovery');
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe('/manage/integrations'));
});

it('shows not found for an unknown settings subpage', async () => {
  stubSignedIn();
  window.history.replaceState(null, '', '/manage/settings/nao-existe');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeTruthy();
});

it('reaches Activity and Settings from "More" in the phone bottom bar', async () => {
  stubSignedIn();
  window.history.replaceState(null, '', '/manage/integrations');
  render(<App />);
  const bar = await screen.findByRole('navigation', { name: 'Seções' });
  expect(
    within(bar)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Probes', 'Integrações', 'Agentes', 'Mais']);
  fireEvent.click(within(bar).getByRole('button', { name: 'Mais' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Configurações' }));
  await waitFor(() => expect(window.location.pathname).toBe('/manage/settings'));
  expect(within(bar).getByRole('button', { name: 'Mais' }).getAttribute('aria-current')).toBe(
    'page',
  );
});

function stubSession(authenticated = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated }) };
      if (url === '/api/services') return { ok: true, json: async () => [] };
      if (url === '/api/status') return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, json: async () => [] };
    }),
  );
}
const SEARCH_BOX = 'Buscar serviços ou executar um comando';

it('runs the single-key shortcuts in the authenticated shell', async () => {
  localStorage.clear();
  stubSession();
  render(<App />);
  await screen.findByRole('heading', { name: 'Tudo em seu lugar.' });
  fireEvent.keyDown(document.body, { key: 'g' });
  fireEvent.keyDown(document.body, { key: 'i' });
  await waitFor(() => expect(window.location.pathname).toBe('/manage/integrations'));
  fireEvent.keyDown(document.body, { key: 'g' });
  fireEvent.keyDown(document.body, { key: 'h' });
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  fireEvent.keyDown(document.body, { key: 'n' });
  await waitFor(() => expect(window.location.pathname).toBe('/manage/services/new'));
  window.history.replaceState(null, '', '/');
  fireEvent.popState(window);
  fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
  expect(await screen.findByRole('dialog', { name: 'Atalhos de teclado' })).toBeTruthy();
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.keyDown(document.body, { key: '/' });
  expect(await screen.findByPlaceholderText(SEARCH_BOX)).toBeTruthy();
});

it('does not run navigation shortcuts outside the services pages for n', async () => {
  localStorage.clear();
  stubSession();
  window.history.replaceState(null, '', '/manage/agents');
  render(<App />);
  await screen.findByRole('heading', { name: /Agentes/ });
  fireEvent.keyDown(document.body, { key: 'n' });
  expect(window.location.pathname).toBe('/manage/agents');
});

it('turns the single keys off from Settings but keeps Ctrl K', async () => {
  localStorage.setItem('homora-shortcuts', 'off');
  stubSession();
  render(<App />);
  await screen.findByRole('heading', { name: 'Tudo em seu lugar.' });
  fireEvent.keyDown(document.body, { key: '/' });
  fireEvent.keyDown(document.body, { key: 'n' });
  expect(screen.queryByPlaceholderText(SEARCH_BOX)).toBeNull();
  expect(window.location.pathname).toBe('/');
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
  expect(await screen.findByPlaceholderText(SEARCH_BOX)).toBeTruthy();
  localStorage.clear();
});

it('keeps the shortcuts inert on the login screen and the public status page', async () => {
  localStorage.clear();
  stubSession(false);
  render(<App />);
  await screen.findByRole('button', { name: 'Entrar' });
  fireEvent.keyDown(document.body, { key: 'g' });
  fireEvent.keyDown(document.body, { key: 'i' });
  fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
  expect(window.location.pathname).toBe('/login');
  expect(screen.queryByRole('dialog')).toBeNull();
  cleanup();
  window.history.replaceState(null, '', '/status');
  stubSession(true);
  render(<App />);
  await waitFor(() => expect(window.location.pathname).toBe('/status'));
  fireEvent.keyDown(document.body, { key: '/' });
  fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
  fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByPlaceholderText(SEARCH_BOX)).toBeNull();
});
