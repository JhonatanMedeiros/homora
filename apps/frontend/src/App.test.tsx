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
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nada' } });
  expect(screen.getByText('Nenhum serviço encontrado')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
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
      if (url === '/api/proxmox/status')
        return { ok: true, json: async () => ({ configured: false }) };
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
  expect(await screen.findByText('Indisponível')).toBeTruthy();
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
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: false }) };
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
      if (url === '/api/proxmox/status')
        return { ok: true, json: async () => ({ configured: false }) };
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Todos' })[1]);
  expect(screen.getByRole('link', { name: /Um/ })).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Dois/ })).toBeNull();
});

it('only removes a service after inline confirmation', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: false }) };
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
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: false }) };
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
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: false }) };
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
      if (url === '/api/proxmox/status' || url === '/api/integrations/catalog')
        return { ok: false, json: async () => ({}) };
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
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: false }) };
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
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: false }) };
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
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }));
  expect(await screen.findByText('Adicionar “Immich”')).toBeTruthy();
  expect(screen.getByText('Aguardando você')).toBeTruthy();
  expect(screen.getAllByText('Ler serviços').length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', { name: /Aprovar e aplicar/ }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proposals/p1/review',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ approve: true }) }),
    ),
  );
});

it('does not treat unauthorized private network as service down', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/connections') return { ok: true, json: async () => [] };
      if (url === '/api/proxmox/status')
        return { ok: true, json: async () => ({ configured: false }) };
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
  expect(await screen.findByText('Monitoramento bloqueado')).toBeTruthy();
  expect(screen.queryByText('Indisponível')).toBeNull();
  expect(screen.getByText(/1 de \d+ no ar/)).toBeTruthy();
  expect(screen.getByText(/1 sem monitoramento/)).toBeTruthy();
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
      if (url === '/api/proxmox/status')
        return { ok: true, json: async () => ({ configured: false }) };
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
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }));
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
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Jelly' } });
  const results = screen.getByRole('list', { name: 'Resultados rápidos' });
  expect(within(results).getByRole('link', { name: /Jellyfin/ })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' });
  expect(document.activeElement).toBe(within(results).getByRole('link', { name: /Jellyfin/ }));
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
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'teste' } });
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
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('teste');
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
      if (url === '/api/proxmox/status')
        return { ok: true, json: async () => ({ configured: false }) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Integrações' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }));
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
