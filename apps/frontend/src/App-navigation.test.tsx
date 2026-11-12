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
it('moves a service to another group from the organize menu', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Wiki', url: 'http://wiki.test/', category: 'Casa', description: '' },
            { id: 2, name: 'Proxmox', url: 'http://pve.test/', category: 'Infra', description: '' },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Wiki');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções de Wiki' }), { key: 'Enter' });
  fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Mover para o grupo' }), {
    key: 'ArrowRight',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Infra' }));
  await waitFor(() => {
    const put = calls.find((call) => call.url === '/api/services/1' && call.method === 'PUT');
    expect(put).toBeTruthy();
    expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ name: 'Wiki', category: 'Infra' });
  });
  window.history.replaceState(null, '', '/');
});

it('moves a service by dragging it onto another group row or an empty group', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Wiki', url: 'http://wiki.test/', category: 'Casa', description: '' },
            { id: 2, name: 'Proxmox', url: 'http://pve.test/', category: 'Infra', description: '' },
          ],
        };
      if (url === '/api/groups' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Casa', position: 0, columns: null },
            { id: 2, name: 'Infra', position: 1, columns: null },
            { id: 3, name: 'Vazio', position: 2, columns: null },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Wiki');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  const rowOf = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
  const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
  // Onto a row of another group.
  fireEvent.dragStart(rowOf('Wiki'), { dataTransfer });
  fireEvent.dragOver(rowOf('Proxmox'), { dataTransfer });
  fireEvent.drop(rowOf('Proxmox'), { dataTransfer });
  await waitFor(() => {
    const put = calls.find((call) => call.url === '/api/services/1' && call.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ category: 'Infra' });
  });
  calls.length = 0;
  // Onto an empty group's drop zone, which only exists while dragging.
  expect(document.querySelector('[data-group-drop]')).toBeNull();
  fireEvent.dragStart(rowOf('Proxmox'), { dataTransfer });
  const zone = await waitFor(() => {
    const found = document.querySelector('[data-group-drop]');
    expect(found).toBeTruthy();
    return found as HTMLElement;
  });
  fireEvent.dragOver(zone, { dataTransfer });
  fireEvent.drop(zone, { dataTransfer });
  await waitFor(() => {
    const put = calls.find((call) => call.url === '/api/services/2' && call.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toMatchObject({ category: 'Vazio' });
  });
  window.history.replaceState(null, '', '/');
});

it('keeps focus on an arrow when its row reaches the end and announces the position', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Alfa', url: 'http://wiki.test/', category: 'Casa', description: '' },
            { id: 2, name: 'Beta', url: 'http://notes.test/', category: 'Casa', description: '' },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Alfa');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  const down = screen.getByRole('button', { name: 'Mover Alfa para baixo' });
  down.focus();
  fireEvent.click(down);
  expect(await screen.findByText('Alfa: posição 2 de 2.')).toBeTruthy();
  // At the end the arrow stays focusable instead of dropping focus to the page.
  expect(
    screen.getByRole('button', { name: 'Mover Alfa para baixo' }).getAttribute('aria-disabled'),
  ).toBe('true');
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Mover Alfa para baixo' }),
  );
  window.history.replaceState(null, '', '/');
});

it('notes when availability cannot be refreshed', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/service-status') return { ok: false, json: async () => ({}) };
      if (url === '/api/services')
        return {
          ok: true,
          json: async () => [
            { id: 1, name: 'Wiki', url: 'http://wiki.test/', category: 'Casa', description: '' },
          ],
        };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  await screen.findByText('Wiki');
  expect(await screen.findByText(/Não foi possível atualizar a disponibilidade/)).toBeTruthy();
});

it('undoes a move to another group, restoring group and order', async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/manage/services');
  const calls: { url: string; method?: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      calls.push({ url, method: init?.method, body: init?.body });
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services' && !init?.method)
        return {
          ok: true,
          json: async () => [
            {
              id: 1,
              name: 'Alfa',
              url: 'http://a.test/',
              category: 'Casa',
              description: '',
              position: 0,
            },
            {
              id: 3,
              name: 'Beta',
              url: 'http://b.test/',
              category: 'Casa',
              description: '',
              position: 1,
            },
            { id: 2, name: 'Proxmox', url: 'http://pve.test/', category: 'Infra', description: '' },
          ],
        };
      return { ok: true, json: async () => (init?.method ? {} : []) };
    }),
  );
  render(<App />);
  await screen.findByText('Alfa');
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções de Alfa' }), { key: 'Enter' });
  fireEvent.keyDown(await screen.findByRole('menuitem', { name: 'Mover para o grupo' }), {
    key: 'ArrowRight',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Infra' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
  await waitFor(() => {
    const order = calls.find((call) => call.url === '/api/services/order');
    expect(JSON.parse(order?.body ?? '{}')).toEqual({ category: 'Casa', ids: [1, 3] });
  });
  const puts = calls.filter((call) => call.url === '/api/services/1' && call.method === 'PUT');
  expect(puts.map((call) => JSON.parse(call.body ?? '{}').category)).toEqual(['Infra', 'Casa']);
  window.history.replaceState(null, '', '/');
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
  window.history.replaceState(null, '', '/manage/services');
  render(<App />);
  const nav = await screen.findByRole('navigation', { name: 'Gerenciamento' });
  expect(within(nav).queryByRole('button', { name: 'Conta' })).toBeNull();
  for (const name of ['Serviços', 'Integrações', 'Agentes', 'Atividade', 'Configurações'])
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
  window.history.replaceState(null, '', '/manage/services');
  render(<App />);
  const bar = await screen.findByRole('navigation', { name: 'Seções' });
  expect(
    within(bar)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Serviços', 'Integrações', 'Agentes', 'Mais']);
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
