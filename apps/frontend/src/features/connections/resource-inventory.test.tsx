// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setLocale } from '@/i18n';
import type { IntegrationResource, ResourceLink } from '@homora/shared';
import { Connections } from './connections';
import { ResourceInventoryPanel } from './resource-inventory';
import { filterResources } from '@homora/integrations/resources/client';
import type { Connection } from './connection-model';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLocale('en');
  localStorage.clear();
});
beforeEach(() => setLocale('pt-BR'));

const connection: Connection = {
  id: 2,
  type: 'coolify',
  name: 'Coolify casa',
  url: 'https://resources.example',
  allowPrivate: false,
  hasSecret: true,
  hasCa: false,
};
const app = (over: Partial<IntegrationResource> = {}): IntegrationResource => ({
  uuid: 'app1',
  type: 'application',
  name: 'Blog',
  description: 'Meu blog',
  state: 'running',
  rawStatus: 'running:healthy',
  urls: ['https://blog.example.com'],
  environmentId: 1,
  ...over,
});
const resources: IntegrationResource[] = [
  app(),
  app({
    uuid: 'svc1',
    type: 'service',
    name: 'Plausible',
    description: null,
    state: 'stopped',
    urls: [],
    environmentId: 2,
  }),
  app({
    uuid: 'app2',
    name: 'Wiki',
    state: 'degraded',
    urls: ['https://wiki.one', 'https://wiki.two'],
  }),
];

type Calls = { method: string; url: string; body?: unknown }[];
function stubApi(options: {
  inventory?: 'error' | 'invalid' | IntegrationResource[];
  links?: ResourceLink[];
  cards?: { id: number; name: string; url: string }[];
  failCreate?: string[];
  failLink?: boolean;
}) {
  const calls: Calls = [];
  let nextId = 100;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    calls.push({ method, url, body });
    const ok = (data: unknown) => ({ ok: true, json: async () => data });
    if (url.startsWith('/api/connections/2/resources')) {
      if (options.inventory === 'error')
        return { ok: false, json: async () => ({ code: 'unmapped' }) };
      if (options.inventory === 'invalid') return ok({ nope: true });
      return ok({
        data: { resources: options.inventory ?? resources },
        checkedAt: '2026-01-01T10:00:00Z',
      });
    }
    if (url === '/api/resource-links' && method === 'GET') return ok(options.links ?? []);
    if (url === '/api/services' && method === 'GET') return ok(options.cards ?? []);
    if (url === '/api/groups') return ok([{ id: 1, name: 'Apps' }]);
    if (url === '/api/services' && method === 'POST') {
      if (options.failCreate?.includes((body as { name: string }).name))
        return { ok: false, json: async () => ({ error: 'Falhou ao criar' }) };
      return ok({ id: nextId++ });
    }
    if (url.endsWith('/resource-link') && method === 'PUT') {
      if (options.failLink) return { ok: false, json: async () => ({ error: 'Vínculo falhou' }) };
      return ok({ id: 1 });
    }
    if (url.endsWith('/resource-link') && method === 'DELETE') return ok({ ok: true });
    return ok([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}
const open = () => render(<ResourceInventoryPanel connection={connection} onClose={() => {}} />);

it('filters by text, type and state', () => {
  expect(filterResources(resources, 'wiki.two', 'all', 'all').map((r) => r.name)).toEqual(['Wiki']);
  expect(filterResources(resources, '', 'service', 'all').map((r) => r.name)).toEqual([
    'Plausible',
  ]);
  expect(filterResources(resources, '', 'all', 'degraded').map((r) => r.name)).toEqual(['Wiki']);
  expect(filterResources(resources, 'meu', 'application', 'running').map((r) => r.name)).toEqual([
    'Blog',
  ]);
});

it('lists resources with the Coolify status, separate from the HTTP monitor, and filters them', async () => {
  stubApi({
    links: [
      {
        id: 1,
        serviceId: 5,
        integrationId: 2,
        resourceUuid: 'app1',
        resourceType: 'application',
        seenName: 'Blog',
        seenUrl: null,
      },
    ],
    cards: [{ id: 5, name: 'Meu card', url: 'https://x' }],
  });
  open();
  expect(screen.getByText('Carregando recursos...')).toBeTruthy();
  expect(await screen.findByText('Blog')).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Status da integração' })).toBeTruthy();
  expect(screen.getByText('Ambiente 2')).toBeTruthy();
  expect(await screen.findByText('Meu card')).toBeTruthy();
  expect(screen.getByText('Sem endereço')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Buscar por nome, descrição ou endereço'), {
    target: { value: 'wiki' },
  });
  expect(screen.queryByText('Plausible')).toBeNull();
  expect(screen.getByText('Wiki')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Buscar por nome, descrição ou endereço'), {
    target: { value: 'zzz' },
  });
  expect(screen.getByText('Nenhum recurso corresponde aos filtros.')).toBeTruthy();
});

it('shows an error with a retry, an invalid-data error and an empty state', async () => {
  stubApi({ inventory: 'error' });
  open();
  expect(await screen.findByText('Não foi possível ler os recursos da integração.')).toBeTruthy();
  cleanup();
  stubApi({ inventory: 'invalid' });
  open();
  expect(
    await screen.findByText('A integração devolveu dados que o Homora não conseguiu usar.'),
  ).toBeTruthy();
  cleanup();
  stubApi({ inventory: [] });
  open();
  expect(await screen.findByText('Nenhum recurso visível.')).toBeTruthy();
});

it('creates nothing until the review is confirmed, then creates and links each card', async () => {
  const calls = stubApi({});
  open();
  await screen.findByText('Blog');
  fireEvent.click(screen.getByLabelText('Selecionar Blog'));
  fireEvent.click(screen.getByLabelText('Selecionar Wiki'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar cards (2)' }));
  const dialog = await screen.findByRole('dialog', { name: 'Revise os cards a criar' });
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  // Wiki has two domains: the select offers both plus manual entry.
  fireEvent.change(within(dialog).getAllByLabelText('Nome')[0]!, {
    target: { value: 'Blog pessoal' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar (2)' }));
  await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(2));
  const posts = calls.filter((call) => call.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[0]!.body).toMatchObject({
    name: 'Blog pessoal',
    url: 'https://blog.example.com',
    allowPrivate: false,
    icon: 'brand:coolify',
  });
  expect(posts[1]!.body).toMatchObject({ url: 'https://wiki.one', allowPrivate: false });
  expect(calls.find((c) => c.url === '/api/services/100/resource-link')?.body).toMatchObject({
    integrationId: 2,
    resourceUuid: 'app1',
    resourceType: 'application',
    name: 'Blog',
    url: 'https://blog.example.com',
  });
});

it('requires an address for a resource without one and lets the user skip it', async () => {
  const calls = stubApi({});
  open();
  await screen.findByText('Plausible');
  fireEvent.click(screen.getByLabelText('Selecionar Plausible'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar cards (1)' }));
  const dialog = await screen.findByRole('dialog', { name: 'Revise os cards a criar' });
  expect(within(dialog).getByText('Informe um endereço http ou https válido.')).toBeTruthy();
  expect(
    (within(dialog).getByRole('button', { name: 'Confirmar (1)' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.change(within(dialog).getByLabelText('Endereço digitado'), {
    target: { value: 'https://plausible.example' },
  });
  await waitFor(() =>
    expect(
      (within(dialog).getByRole('button', { name: 'Confirmar (1)' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  // Unticking skips it entirely.
  fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Plausible' }));
  expect(
    (within(dialog).getByRole('button', { name: 'Confirmar (0)' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
});

it('flags a duplicate address and links the existing card instead of creating one', async () => {
  const calls = stubApi({
    cards: [{ id: 9, name: 'Meu blog antigo', url: 'https://Blog.example.com/' }],
  });
  open();
  await screen.findByText('Blog');
  fireEvent.click(screen.getByLabelText('Selecionar Blog'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar cards (1)' }));
  const dialog = await screen.findByRole('dialog', { name: 'Revise os cards a criar' });
  expect(within(dialog).getByText(/Meu blog antigo.*já usa este endereço/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar (1)' }));
  await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
  expect(calls.filter((call) => call.method === 'POST')).toHaveLength(0);
  expect(calls.find((call) => call.method === 'PUT')?.url).toBe('/api/services/9/resource-link');
});

it('reports a failed row without hiding it and keeps the others', async () => {
  const calls = stubApi({ failCreate: ['Blog'] });
  open();
  await screen.findByText('Blog');
  fireEvent.click(screen.getByLabelText('Selecionar Blog'));
  fireEvent.click(screen.getByLabelText('Selecionar Wiki'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar cards (2)' }));
  const dialog = await screen.findByRole('dialog', { name: 'Revise os cards a criar' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar (2)' }));
  expect(await within(dialog).findByText('Falhou ao criar')).toBeTruthy();
  expect(within(dialog).getByText('1 salvos, 1 com falha.')).toBeTruthy();
  expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
});

it('offers Resources only on Coolify connections and explains links when removing', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url === '/api/connections' ? [connection] : []),
    })),
  );
  render(<Connections />);
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir Coolify casa' }));
  const dialog = await screen.findByRole('dialog', { name: 'Coolify casa' });
  expect(within(dialog).getByRole('button', { name: 'Recursos' })).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
  expect(await screen.findByText(/vínculos entre os recursos dela e os seus cards/)).toBeTruthy();
});
