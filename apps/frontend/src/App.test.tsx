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
it('displays services, filters, and submits a new entry', async () => {
  const services = [
    { id: 1, name: 'Jellyfin', url: 'http://localhost:8096/', category: 'Mídia', description: '' },
  ];
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (_url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (_url === '/api/connections') return { ok: true, json: async () => [] };
    if (init?.method === 'POST') services.push({ id: 2, ...JSON.parse(String(init.body)) });
    return { ok: true, json: async () => [...services] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  expect(await screen.findByRole('link', { name: /Jellyfin/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Serviços',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: /Adicionar serviço/ }));
  expect(screen.getByRole('dialog', { name: 'Novo serviço' })).toBeTruthy();
  const dialog = screen.getByRole('form', { name: 'Novo serviço' });
  fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Proxmox' } });
  fireEvent.change(within(dialog).getByLabelText('URL'), {
    target: { value: 'http://localhost:8006' },
  });
  fireEvent.change(within(dialog).getByLabelText('Categoria'), {
    target: { value: 'Infraestrutura' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Opções avançadas' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Escolher ícone' }));
  fireEvent.change(screen.getByPlaceholderText('Buscar ícones pelo nome'), {
    target: { value: 'film' },
  });
  fireEvent.click(screen.getByRole('option', { name: 'film' }));
  expect((within(dialog).getByLabelText(/Ícone/) as HTMLInputElement).value).toBe('lucide:film');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar serviço' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/services',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  expect(await screen.findByRole('link', { name: /Proxmox/ })).toBeTruthy();
});

it('shows unknown status and timestamp of last attempt without depending on status', async () => {
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
            11: { status: 'unavailable', lastAttempt: '2026-11-10T12:30:00.000Z' },
          }),
        };
      return {
        ok: true,
        json: async () => [
          {
            id: 11,
            name: 'Exemplo',
            url: 'https://example.com/',
            category: 'Web',
            description: '',
          },
        ],
      };
    }),
  );
  render(<App />);
  expect(await screen.findByText('Fora do ar')).toBeTruthy();
  expect(screen.getByText(/última tentativa/)).toBeTruthy();
});

it('allows sign-in after account creation even if first login fails', async () => {
  let attempts = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: false, authenticated: false }) };
    if (url === '/api/auth/setup') return { ok: true };
    if (url === '/api/auth/sign-in/email') return { ok: ++attempts > 1 };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@homora.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura-123' } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), {
    target: { value: 'senha-segura-123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(await screen.findByText('Bem-vindo de volta.')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('E-mail ou senha inválidos');
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('heading', { name: /Tudo em seu lugar/ })).toBeTruthy();
  const calls = fetchMock.mock.calls as unknown as [string, { body: string }][];
  const setupCalls = calls.filter(([url]) => url === '/api/auth/setup');
  expect(setupCalls).toHaveLength(1);
  expect(JSON.parse(setupCalls[0][1].body)).toEqual({
    name: 'Ana',
    email: 'ana@homora.test',
    password: 'senha-segura-123',
  });
  const loginCalls = calls.filter(([url]) => url === '/api/auth/sign-in/email');
  expect(JSON.parse(loginCalls[1][1].body)).toEqual({
    email: 'ana@homora.test',
    password: 'senha-segura-123',
  });
});

it('does not create the account when the password confirmation differs', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: false, authenticated: false }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@homora.test' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura-123' } });
  fireEvent.change(screen.getByLabelText('Confirmar senha'), {
    target: { value: 'senha-segura-124' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect((await screen.findByRole('alert')).textContent).toContain('As senhas não coincidem');
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/auth/setup')).toBe(false);
});

it('keeps global filter separate from a category named All', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/connections') return { ok: true, json: async () => [] };
      return {
        ok: true,
        json: async () => [
          { id: 1, name: 'Um', url: 'http://localhost:1/', category: 'Todos', description: '' },
          { id: 2, name: 'Dois', url: 'http://localhost:2/', category: 'Outro', description: '' },
        ],
      };
    }),
  );
  render(<App />);
  await screen.findByRole('link', { name: /Dois/ });
  // Buttons named "Todos": the status chip, the global category chip, then the category called Todos.
  fireEvent.click(screen.getAllByRole('button', { name: 'Todos' })[2]);
  expect(screen.getByRole('link', { name: /Um/ })).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Dois/ })).toBeNull();
});

it('only removes a service after inline confirmation', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (init?.method === 'DELETE') return { ok: true, json: async () => ({}) };
    return {
      ok: true,
      json: async () => [
        {
          id: 7,
          name: 'Immich',
          url: 'http://localhost:2283/',
          category: 'Mídia',
          description: '',
        },
      ],
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByRole('link', { name: /Immich/ });
  const deleted = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
  expect(screen.queryByRole('button', { name: 'Remover Immich' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Serviços',
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Remover Immich' }));
  expect(deleted()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção de Immich' }));
  await waitFor(() => expect(deleted()).toHaveLength(1));
  expect(deleted()[0][0]).toBe('/api/services/7');
});

it('edits an existing service in the page form', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (init?.method === 'PUT') return { ok: true, json: async () => ({}) };
    return {
      ok: true,
      json: async () => [
        {
          id: 3,
          name: 'Jellyfin',
          url: 'http://localhost:8096/',
          category: 'Mídia',
          description: '',
        },
      ],
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByRole('link', { name: /Jellyfin/ });
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Serviços',
    }),
  );
  const editButton = await screen.findByRole('button', { name: 'Editar Jellyfin' });
  const serviceRequests = fetchMock.mock.calls.filter(([url]) => url === '/api/services').length;
  fireEvent.click(editButton);
  expect(await screen.findByRole('dialog', { name: 'Editar serviço' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Editar Jellyfin', hidden: true })).toBe(editButton);
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/services')).toHaveLength(
    serviceRequests,
  );
  const form = screen.getByRole('form', { name: 'Editar serviço' });
  expect((within(form).getByLabelText('Nome') as HTMLInputElement).value).toBe('Jellyfin');
  fireEvent.change(within(form).getByLabelText('Nome'), { target: { value: 'Jellyfin 2' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/services/3',
      expect.objectContaining({ method: 'PUT' }),
    ),
  );
});

it('creates, displays, and removes an empty group via UI', async () => {
  let groups: { id: number; name: string; position: number }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (url === '/api/services') return { ok: true, json: async () => [] };
    if (url === '/api/groups' && init?.method === 'POST') {
      const group = {
        id: groups.length + 1,
        name: JSON.parse(String(init.body)).name,
        position: groups.length,
      };
      groups.push(group);
      return { ok: true, status: 201, json: async () => group };
    }
    if (url.startsWith('/api/groups/') && init?.method === 'DELETE') {
      groups = groups.filter((group) => `/api/groups/${group.id}` !== url);
      return { ok: true, json: async () => ({ deleted: true }) };
    }
    if (url.startsWith('/api/groups/') && init?.method === 'PUT') {
      const id = Number(url.split('/').at(-1));
      groups = groups.map((group) =>
        group.id === id ? { ...group, name: JSON.parse(String(init.body)).name } : group,
      );
      return { ok: true, json: async () => groups.find((group) => group.id === id) };
    }
    if (url === '/api/groups') return { ok: true, json: async () => [...groups] };
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
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  // The new group form stays closed until its button is used.
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Novo grupo' }));
  fireEvent.change(screen.getByLabelText('Novo grupo'), { target: { value: 'Infra' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
  expect(await screen.findByRole('heading', { name: /Infra/ })).toBeTruthy();
  expect(screen.getByText('Este grupo ainda não tem cards.')).toBeTruthy();
  const menu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: 'Opções do grupo Infra' }), {
      key: 'Enter',
    });
  menu();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  // The menu closes after a tick; the name field must end up focused, not the menu button.
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText('Novo nome do grupo')),
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Opções do grupo Infra' }),
    ),
  );
  menu();
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
  fireEvent.change(screen.getByLabelText('Novo nome do grupo'), {
    target: { value: 'Infraestrutura' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
  expect(await screen.findByRole('heading', { name: /Infraestrutura/ })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções do grupo Infraestrutura' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
  // Removing asks first; cancelling keeps the group.
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/Remover o grupo "Infraestrutura"/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByRole('heading', { name: /Infraestrutura/ })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Opções do grupo Infraestrutura' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remover' }),
  );
  await waitFor(() => expect(screen.queryByRole('heading', { name: /Infraestrutura/ })).toBeNull());
});

it('keeps services dashboard usable when optional integrations fail', async () => {
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
              id: 8,
              name: 'Local',
              url: 'http://localhost:8080/',
              category: 'Casa',
              description: '',
            },
          ],
        };
      if (url === '/api/groups')
        return { ok: true, json: async () => [{ id: 2, name: 'Casa', position: 0 }] };
      if (url === '/api/connections') throw new Error('offline');
      if (url === '/api/integrations/catalog') return { ok: false, json: async () => ({}) };
      return { ok: false, json: async () => ({}) };
    }),
  );
  render(<App />);
  expect(await screen.findByRole('link', { name: /Local/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Gerenciar' })).toBeTruthy();
});

it('reorders cards and closes form with Escape restoring focus', async () => {
  const cards = [
    {
      id: 1,
      name: 'A',
      url: 'http://localhost:8101/',
      category: 'Casa',
      description: '',
      position: 0,
    },
    {
      id: 2,
      name: 'B',
      url: 'http://localhost:8102/',
      category: 'Casa',
      description: '',
      position: 1,
    },
  ];
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (url === '/api/groups')
      return { ok: true, json: async () => [{ id: 1, name: 'Casa', position: 0 }] };
    if (url === '/api/services/order') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => cards };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  await screen.findByRole('link', { name: /A/ });
  fireEvent.click(screen.getByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(
    within(screen.getByRole('navigation', { name: 'Gerenciamento' })).getByRole('button', {
      name: 'Serviços',
    }),
  );
  expect(screen.queryByRole('button', { name: 'Mover A para baixo' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mover A para baixo' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/services/order',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ category: 'Casa', ids: [2, 1] }),
      }),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
  const add = screen.getByRole('button', { name: /Adicionar serviço/ });
  fireEvent.click(add);
  expect(document.activeElement).toBe(screen.getByLabelText('Nome'));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(add));
  expect(screen.queryByRole('form', { name: 'Novo serviço' })).toBeNull();
});
