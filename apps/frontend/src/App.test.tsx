// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('apresenta serviços, filtra e envia um novo cadastro', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: /Adicionar serviço/ }));
  const dialog = screen.getByRole('form', { name: 'Novo serviço' });
  fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Proxmox' } });
  fireEvent.change(within(dialog).getByLabelText('URL'), {
    target: { value: 'http://localhost:8006' },
  });
  fireEvent.change(within(dialog).getByLabelText('Categoria'), {
    target: { value: 'Infraestrutura' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar serviço' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/services',
      expect.objectContaining({ method: 'POST' }),
    ),
  );
  expect(await screen.findByRole('link', { name: /Proxmox/ })).toBeTruthy();
});

it('mostra estado desconhecido e horário da última tentativa sem depender do status', async () => {
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

it('permite entrar após criar a conta mesmo se o primeiro login falhar', async () => {
  let attempts = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/auth/status')
      return { ok: true, json: async () => ({ configured: false, authenticated: false }) };
    if (url === '/api/auth/setup') return { ok: true };
    if (url === '/api/auth/login') return { ok: ++attempts > 1 };
    if (url === '/api/connections') return { ok: true, json: async () => [] };
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: false }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<App />);
  fireEvent.change(await screen.findByLabelText('Senha'), {
    target: { value: 'senha-segura-123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(await screen.findByText('Bem-vindo de volta.')).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toContain('Senha inválida');
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('heading', { name: /Seus serviços/ })).toBeTruthy();
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/setup')).toHaveLength(1);
});

it('mantém o filtro geral separado de uma categoria chamada Todos', async () => {
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

it('só remove um serviço depois da confirmação na própria linha', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Remover Immich' }));
  expect(deleted()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção de Immich' }));
  await waitFor(() => expect(deleted()).toHaveLength(1));
  expect(deleted()[0][0]).toBe('/api/services/7');
});

it('edita um serviço existente no formulário da página', async () => {
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
  fireEvent.click(screen.getByRole('button', { name: 'Editar Jellyfin' }));
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

it('cria, mostra e remove um grupo vazio pela interface', async () => {
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
  await screen.findByRole('heading', { name: 'Seus serviços' });
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.change(screen.getByLabelText('Novo grupo'), { target: { value: 'Infra' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar grupo' }));
  expect(await screen.findByRole('heading', { name: /Infra/ })).toBeTruthy();
  expect(screen.getByText('Este grupo ainda não tem cards.')).toBeTruthy();
  const rename = screen.getByRole('button', { name: 'Renomear grupo Infra' });
  fireEvent.click(rename);
  expect(screen.queryByLabelText('Novo grupo')).toBeNull();
  expect(document.activeElement).toBe(screen.getByLabelText('Novo nome do grupo'));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(document.activeElement).toBe(rename));
  fireEvent.click(rename);
  fireEvent.change(screen.getByLabelText('Novo nome do grupo'), {
    target: { value: 'Infraestrutura' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
  expect(await screen.findByRole('heading', { name: /Infraestrutura/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remover grupo Infraestrutura' }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: /Infraestrutura/ })).toBeNull());
});

it('mantém o painel de serviços utilizável quando integrações opcionais falham', async () => {
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
  expect(screen.getByRole('button', { name: /Adicionar serviço/ })).toBeTruthy();
});

it('reordena cards e fecha o formulário com Escape devolvendo o foco', async () => {
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
  expect(screen.queryByRole('button', { name: 'Mover A para baixo' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Organizar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mover A para baixo' }));
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

it('mostra propostas pendentes em linguagem clara e aprova com um clique', async () => {
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
  await screen.findByRole('heading', { name: 'Seus serviços' });
  fireEvent.click(screen.getAllByRole('button', { name: 'Agentes' })[0]);
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

it('não trata rede privada não autorizada como serviço fora do ar', async () => {
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
  expect(screen.getByText('Autorize a rede privada em Editar.')).toBeTruthy();
  expect(screen.queryByText('Indisponível')).toBeNull();
  expect(screen.getByText(/Tudo no ar por aqui/)).toBeTruthy();
  expect(screen.getByText(/1 sem monitoramento/)).toBeTruthy();
});

it('mostra antes e depois de uma proposta de alteração', async () => {
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Agentes' })[0]);
  expect(await screen.findByText('Alterar “Jellyfin”')).toBeTruthy();
  expect(screen.getByText('http://antigo.local:8096/')).toBeTruthy();
  expect(screen.getByText('http://novo.local:8096/')).toBeTruthy();
  expect(screen.getByText('2 campos continuam iguais.')).toBeTruthy();
});
