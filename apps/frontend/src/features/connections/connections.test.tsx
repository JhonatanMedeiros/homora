// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Connections } from './connections';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
/** Opens the "⋯" menu of a row and picks one of its items. */
async function choose(row: string, item: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name: `Ações de ${row}` }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
}
const openWidgets = () => fireEvent.mouseDown(screen.getByRole('tab', { name: /Widgets/ }));
const pick = async (type: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar conexão' }));
  fireEvent.click(await screen.findByRole('button', { name: type }));
};
it('registers Home Assistant with explicit private network authorization', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Connections />);
  await pick(/Home Assistant/);
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Casa' } });
  fireEvent.change(screen.getByLabelText('URL do serviço'), {
    target: { value: 'https://example.com' },
  });
  fireEvent.change(screen.getByLabelText('Entidade'), { target: { value: 'sensor.temperatura' } });
  fireEvent.change(screen.getByLabelText('Token de acesso'), {
    target: { value: 'token-de-teste' },
  });
  fireEvent.click(screen.getByLabelText('Permitir acesso à rede privada para este serviço'));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar conexão' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connections',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"allowPrivate":true'),
      }),
    ),
  );
  expect(await screen.findByText('Integração salva.')).toBeTruthy();
});
it('creates a named Proxmox connection with its own credentials', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => (init?.method === 'POST' ? { ok: true } : []),
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<Connections />);
  await pick(/Proxmox/);
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Cluster principal' } });
  fireEvent.change(screen.getByLabelText('URL do serviço'), {
    target: { value: 'https://pve.example:8006' },
  });
  fireEvent.change(screen.getByLabelText('ID do token'), { target: { value: 'user@pve!homora' } });
  fireEvent.change(screen.getByLabelText('Segredo do token'), { target: { value: 'test-secret' } });
  fireEvent.click(screen.getByLabelText('Permitir acesso à rede privada para este serviço'));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar conexão' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connections',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"tokenId":"user@pve!homora"'),
      }),
    ),
  );
});
it('tests connection and displays sanitized API failure', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/test'))
        return { ok: false, json: async () => ({ error: 'A conexão falhou.' }) };
      if (url === '/api/widgets') return { ok: true, json: async () => [] };
      return {
        ok: true,
        json: async () => [
          {
            id: 1,
            type: 'jellyfin',
            name: 'Mídia',
            url: 'https://example.com',
            allowPrivate: false,
            hasSecret: false,
            hasCa: false,
          },
        ],
      };
    }),
  );
  render(<Connections />);
  await choose('Mídia', 'Testar conexão');
  expect(await screen.findByText('A conexão falhou.')).toBeTruthy();
});

it.each([
  ['jellyfin', { name: 'Servidor', version: '10.0' }, 'Servidor: Servidor · Versão: 10.0'],
  [
    'home-assistant',
    { entityId: 'sensor.temp', state: '20' },
    'Entidade: sensor.temp · Estado: 20',
  ],
  [
    'uptime-kuma',
    { up: 2, down: 1, pending: 0, maintenance: 0, unknown: 0 },
    'Ativos: 2 · Indisponíveis: 1',
  ],
  [
    'adguard-home',
    { running: true, protectionEnabled: false, version: '1' },
    'Serviço: ativo · Proteção: desativada',
  ],
])('apresenta dados legíveis de %s', async (type, data, expected) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.includes('/data')
        ? { ok: true, json: async () => ({ data, checkedAt: '2026-01-01T00:00:00.000Z' }) }
        : url === '/api/widgets'
          ? { ok: true, json: async () => [] }
          : {
              ok: true,
              json: async () => [
                {
                  id: 1,
                  type,
                  name: 'Teste',
                  url: 'https://example.com',
                  allowPrivate: false,
                  hasSecret: false,
                  hasCa: false,
                },
              ],
            },
    ),
  );
  render(<Connections />);
  await choose('Teste', 'Atualizar dados');
  expect(await screen.findByText((content) => content.includes(expected))).toBeTruthy();
});

it('allows retrying load when the API fails', async () => {
  let connectionCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/connections') connectionCalls += 1;
      return {
        ok: url !== '/api/connections' || connectionCalls > 1,
        json: async () => [],
      };
    }),
  );
  render(<Connections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tentar carregar novamente' }));
  expect(await screen.findByText('Nenhuma conexão cadastrada.')).toBeTruthy();
});

it('creates, queries, and removes named widgets using linked connection', async () => {
  const widget = { id: 5, integrationId: 1, type: 'jellyfin', name: 'Mídia sala' };
  let created = false;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/widgets' && init?.method === 'POST') {
      created = true;
      return { ok: true, json: async () => widget };
    }
    if (url === '/api/widgets' && !init?.method)
      return { ok: true, json: async () => (created ? [widget] : []) };
    if (url === '/api/widgets/5' && init?.method === 'DELETE')
      return { ok: true, json: async () => ({ ok: true }) };
    if (url === '/api/widgets') return { ok: true, json: async () => [] };
    if (url === '/api/connections/1/data')
      return { ok: true, json: async () => ({ data: { name: 'Servidor', version: '10.0' } }) };
    return {
      ok: true,
      json: async () => [
        {
          id: 1,
          type: 'jellyfin',
          name: 'Mídia',
          url: 'https://example.com',
          allowPrivate: false,
          hasSecret: false,
          hasCa: false,
        },
      ],
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Connections />);
  await screen.findByRole('tab', { name: /Widgets/ });
  openWidgets();
  fireEvent.change(await screen.findByLabelText('Nome do widget'), {
    target: { value: 'Mídia sala' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Criar widget' }));
  expect(await screen.findByText('Widget criado.')).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/widgets',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ integrationId: 1, name: 'Mídia sala' }),
    }),
  );
  await choose('Mídia sala', 'Ver dados agora');
  expect(await screen.findByText('Servidor: Servidor · Versão: 10.0')).toBeTruthy();
  await choose('Mídia sala', 'Remover');
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Remover Mídia sala?')).toBeTruthy();
  expect(screen.queryByText('Widget removido.')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
  expect(await screen.findByText('Widget removido.')).toBeTruthy();
});

it('offers Proxmox as widget source and queries aggregated numbers', async () => {
  const widgets: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/connections')
      return {
        ok: true,
        json: async () => [
          {
            id: 99,
            type: 'proxmox',
            name: 'Servidor Proxmox',
            url: 'https://pve.example',
            allowPrivate: true,
          },
        ],
      };
    if (url === '/api/widgets' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      widgets.push({ id: 7, integrationId: 99, type: 'proxmox', name: body.name, serviceId: null });
      return { ok: true, json: async () => widgets[0] };
    }
    if (url === '/api/widgets') return { ok: true, json: async () => [...widgets] };
    if (url === '/api/connections/99/data')
      return {
        ok: true,
        json: async () => ({
          data: {
            vms: { running: 1, total: 1 },
            containers: { running: 16, total: 25 },
            cpu: 6,
            memory: null,
          },
        }),
      };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Connections />);
  await screen.findByRole('tab', { name: /Widgets/ });
  openWidgets();
  const select = await screen.findByRole('combobox', { name: 'Conexão' });
  expect(select.textContent).toBe('Servidor Proxmox');
  fireEvent.change(screen.getByLabelText('Nome do widget'), { target: { value: 'Cluster' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar widget' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/widgets',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ integrationId: 99, name: 'Cluster' }),
      }),
    ),
  );
  await choose('Cluster', 'Ver dados agora');
  expect(await screen.findByText('VMs: 1 / 1 · LXC: 16 / 25 · CPU: 6%')).toBeTruthy();
});

it('lists the types to connect with what each one reads, then opens its form without a type select', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/integrations/catalog')
        return {
          ok: true,
          json: async () => [
            { type: 'proxmox', label: 'Proxmox VE', capabilities: ['inventory', 'server-info'] },
            { type: 'adguard-home', label: 'AdGuard Home', capabilities: ['dns-status'] },
          ],
        };
      if (url === '/api/connections')
        return {
          ok: true,
          json: async () => [
            { id: 1, type: 'proxmox', name: 'Phobos', url: 'https://pve.test', allowPrivate: true },
          ],
        };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<Connections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar conexão' }));
  expect(await screen.findByText('O que você quer conectar?')).toBeTruthy();
  expect(
    await screen.findByText('Inventário da infraestrutura, Informações do servidor'),
  ).toBeTruthy();
  expect(screen.getByText('1 conectada')).toBeTruthy();
  for (const name of ['Jellyfin', 'Home Assistant', 'Uptime Kuma', 'AdGuard Home', 'Proxmox VE'])
    expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /AdGuard Home/ }));
  expect(screen.getByText('Nova conexão AdGuard Home')).toBeTruthy();
  expect(screen.queryByLabelText('Tipo de serviço')).toBeNull();
  expect(screen.getByLabelText('Usuário')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByRole('button', { name: 'Adicionar conexão' })).toBeTruthy();
});

it('still lets you pick a type when the catalog cannot be loaded', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: url !== '/api/integrations/catalog',
      json: async () => [],
    })),
  );
  render(<Connections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar conexão' }));
  expect(screen.getByRole('button', { name: /Jellyfin/ })).toBeTruthy();
});

it('asks before removing a connection and removes it once confirmed', async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/connections/1' && init?.method === 'DELETE')
      return { ok: true, json: async () => ({ ok: true }) };
    if (url === '/api/connections')
      return {
        ok: true,
        json: async () => [
          { id: 1, type: 'jellyfin', name: 'Mídia', url: 'https://x.test', allowPrivate: false },
        ],
      };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Connections />);
  await choose('Mídia', 'Remover');
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Remover Mídia?')).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalledWith('/api/connections/1', expect.anything());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  expect(fetchMock).not.toHaveBeenCalledWith('/api/connections/1', expect.anything());
  await choose('Mídia', 'Remover');
  fireEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remover' }),
  );
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/connections/1',
      expect.objectContaining({ method: 'DELETE' }),
    ),
  );
  expect(await screen.findByText('Integração removida.')).toBeTruthy();
});

it('tells you to add a connection before creating widgets', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  render(<Connections />);
  await screen.findByText('Nenhuma conexão cadastrada.');
  openWidgets();
  expect(
    await screen.findByText('Adicione uma conexão primeiro e crie os widgets a partir dela.'),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Adicionar conexão' })).toBeNull();
});
