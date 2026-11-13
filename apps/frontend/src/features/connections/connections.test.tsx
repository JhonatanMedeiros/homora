import { Toaster, toast } from 'sonner';
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Connections } from './connections';
beforeEach(() => {
  render(<Toaster />);
});

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.unstubAllGlobals();
});
/** Opens a connection's details dialog from its card. */
async function openDetails(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: `Abrir ${name}` }));
  return screen.findByRole('dialog', { name });
}
/** Opens the "⋯" menu of a widget row and picks one of its items. */
async function choose(row: string, item: string) {
  fireEvent.keyDown(await screen.findByRole('button', { name: `Ações de ${row}` }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('menuitem', { name: item }));
}
const openWidgets = () => fireEvent.mouseDown(screen.getByRole('tab', { name: /Widgets/ }));
const pick = async (type: RegExp) => {
  fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar conexão' }))[0]!);
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
  const dialog = await openDetails('Mídia');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Testar conexão' }));
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
  const dialog = await openDetails('Teste');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Atualizar dados' }));
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
  fireEvent.click(await screen.findByRole('button', { name: 'Novo widget' }));
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
  fireEvent.click(await screen.findByRole('button', { name: 'Novo widget' }));
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
  fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar conexão' }))[0]!);
  expect(await screen.findByText('O que você quer conectar?')).toBeTruthy();
  // Descriptions come from the built-in definitions, not from a request.
  expect(await screen.findByText('Inventário da infraestrutura')).toBeTruthy();
  expect(
    within(screen.getByRole('button', { name: /Pi-hole/ })).getByText('Estado do DNS'),
  ).toBeTruthy();
  expect(screen.getByText('1 conectada')).toBeTruthy();
  for (const name of [
    'Jellyfin',
    'Home Assistant',
    'Uptime Kuma',
    'AdGuard Home',
    'Proxmox VE',
    'Pi-hole',
  ])
    expect(screen.getByRole('button', { name: new RegExp(name) })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /AdGuard Home/ }));
  expect(screen.getByRole('dialog', { name: 'Nova conexão AdGuard Home' })).toBeTruthy();
  expect(screen.queryByLabelText('Tipo de serviço')).toBeNull();
  expect(screen.getByLabelText('Usuário')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getAllByRole('button', { name: 'Adicionar conexão' }).length).toBeGreaterThan(0);
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
  fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar conexão' }))[0]!);
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
  const dialog = await openDetails('Mídia');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
  expect(await screen.findByRole('dialog', { name: 'Remover Mídia?' })).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalledWith('/api/connections/1', expect.anything());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  expect(fetchMock).not.toHaveBeenCalledWith('/api/connections/1', expect.anything());
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remover conexão' }));
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

it('generates each form from its integration definition', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  render(<Connections />);
  await pick(/Uptime Kuma/);
  expect(screen.getByLabelText('Identificador da página pública')).toBeTruthy();
  expect(screen.queryByLabelText('Senha')).toBeNull();
  expect(screen.queryByLabelText('Token de acesso')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await pick(/AdGuard Home/);
  expect(screen.getByLabelText('Usuário')).toBeTruthy();
  expect(screen.getByLabelText('Senha')).toBeTruthy();
  expect(screen.queryByLabelText('Identificador da página pública')).toBeNull();
});

it('scopes a Proxmox connection to a node picked from its inventory, and can clear it', async () => {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        bodies.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (url === '/api/connections/1/guests')
        return {
          ok: true,
          json: async () => ({ nodes: [{ name: 'pve1' }, { name: 'pve2' }], guests: [] }),
        };
      if (url === '/api/connections')
        return {
          ok: true,
          json: async () => [
            {
              id: 1,
              type: 'proxmox',
              name: 'Phobos',
              url: 'https://pve.test',
              allowPrivate: true,
              node: 'pve2',
              hasSecret: true,
            },
          ],
        };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<Connections />);
  const details = await openDetails('Phobos');
  fireEvent.click(within(details).getByRole('button', { name: 'Editar' }));
  const picker = await screen.findByRole('combobox', { name: 'Nó' });
  expect(picker.textContent).toContain('pve2');
  fireEvent.click(picker);
  fireEvent.click(await screen.findByRole('option', { name: 'Cluster inteiro' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar conexão' }));
  await waitFor(() => expect(bodies).toHaveLength(1));
  expect(bodies[0]).toMatchObject({ type: 'proxmox', node: '' });
});

it('does not offer the node field while creating a Proxmox connection', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  render(<Connections />);
  await pick(/Proxmox/);
  expect(screen.getByLabelText('ID do token')).toBeTruthy();
  expect(screen.queryByLabelText('Nó')).toBeNull();
});

const failing = {
  id: 1,
  type: 'home-assistant',
  name: 'Casa',
  url: 'https://hass.example',
  allowPrivate: false,
  hasSecret: true,
  hasCa: false,
  entityId: 'sensor.temp',
  lastTest: { at: Date.now() - 12 * 60 * 1000, result: 'rejected' },
};
const working = {
  ...failing,
  id: 2,
  type: 'jellyfin',
  name: 'Mídia',
  lastTest: { at: Date.now() - 3 * 60 * 1000, result: 'ok' },
};
const untested = { ...working, id: 3, name: 'Novo', lastTest: null };

it('summarises the connections and shows why one failed on its card', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/connections' ? [failing, working, untested] : []),
    })),
  );
  render(<Connections />);
  await screen.findByRole('button', { name: 'Abrir Casa' });
  const summary = screen.getByText('Precisam de atenção').closest('div') as HTMLElement;
  expect(within(summary).getByText('1')).toBeTruthy();
  expect(screen.getByText('Falhou')).toBeTruthy();
  expect(
    screen.getByText('Funcionando', { selector: '[data-slot="status-light"] span' }),
  ).toBeTruthy();
  expect(screen.getByText('Não testada')).toBeTruthy();
  expect(screen.getByText(/O serviço recusou as credenciais/)).toBeTruthy();
});

it('offers to update the credentials of a rejected connection and focuses them', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/connections' ? [failing] : []),
    })),
  );
  render(<Connections />);
  const dialog = await openDetails('Casa');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Atualizar credenciais' }));
  const secret = await within(dialog).findByLabelText('Token de acesso');
  expect(document.activeElement).toBe(secret);
});

it('keeps the result of a test after reloading and shows it in the details', async () => {
  let tested = false;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/connections/2/test' && init?.method === 'POST') {
      tested = true;
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (url === '/api/connections')
      return {
        ok: true,
        json: async () => [
          { ...working, lastTest: tested ? { at: Date.now(), result: 'ok' } : null },
        ],
      };
    return { ok: true, json: async () => [] };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Connections />);
  const dialog = await openDetails('Mídia');
  expect(within(dialog).getByText(/Ainda não testada/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Testar conexão' }));
  await waitFor(() => expect(within(dialog).queryByText(/Ainda não testada/)).toBeNull());
  expect(within(dialog).getByText('Funcionando')).toBeTruthy();
});

it('asks before discarding what was typed in a form', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  render(<Connections />);
  await pick(/Jellyfin/);
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Mídia' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
  expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe('Mídia');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('searches the types by name or by what they read, and Enter opens the only match', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  render(<Connections />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Adicionar conexão' }))[0]!);
  const search = await screen.findByRole('searchbox', { name: 'Buscar integrações' });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: 'jelly' } });
  expect(screen.getByRole('button', { name: /Jellyfin/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /AdGuard Home/ })).toBeNull();
  // Accents and case do not matter, and the description is searched too.
  fireEvent.change(search, { target: { value: 'INVENTARIO' } });
  expect(screen.getByRole('button', { name: /Proxmox/ })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Jellyfin/ })).toBeNull();
  fireEvent.change(search, { target: { value: 'zzzz' } });
  expect(screen.getByText(/Nenhuma integração para "zzzz"/)).toBeTruthy();
  fireEvent.change(search, { target: { value: 'adguard' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(await screen.findByRole('dialog', { name: 'Nova conexão AdGuard Home' })).toBeTruthy();
});
