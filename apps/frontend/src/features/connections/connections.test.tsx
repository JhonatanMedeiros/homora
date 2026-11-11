// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Connections } from './connections';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('registers Home Assistant with explicit private network authorization', async () => {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Connections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar conexão' }));
  fireEvent.change(screen.getByLabelText('Tipo de serviço'), {
    target: { value: 'home-assistant' },
  });
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
  fireEvent.click(await screen.findByRole('button', { name: 'Testar Mídia' }));
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
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar Teste' }));
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
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar Mídia sala' }));
  expect(await screen.findByText('Servidor: Servidor · Versão: 10.0')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remover widget Mídia sala' }));
  expect(screen.queryByText('Widget removido.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção do widget Mídia sala' }));
  expect(await screen.findByText('Widget removido.')).toBeTruthy();
});

it('offers Proxmox as widget source and queries aggregated numbers', async () => {
  const widgets: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/proxmox/status')
      return { ok: true, json: async () => ({ configured: true, hasCa: false }) };
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
  const select = await screen.findByLabelText('Conexão');
  await waitFor(() => expect((select as HTMLSelectElement).value).toBe('proxmox'));
  fireEvent.change(screen.getByLabelText('Nome do widget'), { target: { value: 'Cluster' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar widget' }));
  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/widgets',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ source: 'proxmox', name: 'Cluster' }),
      }),
    ),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar Cluster' }));
  expect(await screen.findByText('VMs: 1 / 1 · LXC: 16 / 25 · CPU: 6%')).toBeTruthy();
});
