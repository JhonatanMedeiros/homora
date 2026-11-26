import { Toaster, toast } from 'sonner';
// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigTransfer } from './config-transfer';
import type { Preview } from './transfer-model';
import { chooseSelectOption } from '@/test-select';

beforeEach(() => {
  render(<Toaster />);
});

afterEach(() => {
  toast.dismiss();
  cleanup();
  vi.unstubAllGlobals();
});

const preview: Preview = {
  version: 7,
  plan: {
    groups: [{ name: 'Casa', status: 'new' }],
    services: [
      { group: 'Casa', name: 'Pi-hole', url: 'http://192.168.1.2/', status: 'new' },
      { group: 'Casa', name: 'Plex', url: 'http://localhost:32400/', status: 'duplicate' },
    ],
    issues: [{ path: 'groups[0].services[2]', code: 'invalid-url', severity: 'error' }],
    summary: { newGroups: 1, newServices: 1, duplicates: 1, errors: 1, warnings: 0 },
  },
};
/** Calls other than the page list that the import dialog loads on its own. */
const api = (mock: { mock: { calls: unknown[][] } }) =>
  mock.mock.calls.filter(([url]) => url !== '/api/pages');
const file = (text: string, name = 'homora-config.yaml') => new File([text], name);
const choose = (input: HTMLElement, f: File) => fireEvent.change(input, { target: { files: [f] } });

it('offers export downloads in YAML and JSON', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  render(<ConfigTransfer onImported={() => {}} />);
  expect(screen.getByRole('link', { name: /Baixar YAML/ }).getAttribute('href')).toBe(
    '/api/config/export?format=yaml',
  );
  expect(screen.getByRole('link', { name: /Baixar JSON/ }).getAttribute('href')).toBe(
    '/api/config/export?format=json',
  );
});

it('shows preview, reports skipped items, and only saves on confirmation', async () => {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith('preview') ? preview : { created: 1, plan: preview.plan }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  const onImported = vi.fn();
  render(<ConfigTransfer onImported={onImported} />);
  choose(screen.getByLabelText('Arquivo de configuração'), file('version: 1'));
  expect(await screen.findByText(/1 grupo novo e 1 card novo/)).toBeTruthy();
  expect(screen.getByText('Pi-hole')).toBeTruthy();
  expect(screen.getByText('Já existe')).toBeTruthy();
  expect(screen.getByText(/URL deve ser http ou https/)).toBeTruthy();
  expect(api(fetchMock)).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: 'Importar (1)' }));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const [, init] = api(fetchMock)[1] as unknown as [string, { body: string }];
  expect(JSON.parse(init.body)).toEqual({
    content: 'version: 1',
    source: 'homora',
    keepPrivate: false,
    expectedVersion: 7,
  });
  expect(await screen.findByText('Importação concluída: 1 card adicionado.')).toBeTruthy();
});

it('sends keepPrivate only when user checks the option', async () => {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith('preview') ? preview : { created: 1, plan: preview.plan }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ConfigTransfer onImported={() => {}} />);
  choose(screen.getByLabelText('Arquivo de configuração'), file('x'));
  fireEvent.click(await screen.findByRole('checkbox', { name: /Manter as permissões/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Importar (1)' }));
  await waitFor(() => expect(api(fetchMock)).toHaveLength(2));
  const [, init] = api(fetchMock)[1] as unknown as [string, { body: string }];
  expect(JSON.parse(init.body).keepPrivate).toBe(true);
});

it('prompts for new review when configuration has changed', async () => {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith('preview')
      ? { ok: true, status: 200, json: async () => preview }
      : { ok: false, status: 409, json: async () => ({ error: 'x' }) },
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<ConfigTransfer onImported={() => {}} />);
  choose(screen.getByLabelText('Arquivo de configuração'), file('x'));
  fireEvent.click(await screen.findByRole('button', { name: 'Importar (1)' }));
  expect(await screen.findByText('A configuração mudou. Revise a prévia novamente.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Importar/ })).toBeNull();
});

it('rejects large files without calling server and discards preview', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ConfigTransfer onImported={() => {}} />);
  const big = file('x');
  Object.defineProperty(big, 'size', { value: 1_000_001 });
  choose(screen.getByLabelText('Arquivo de configuração'), big);
  expect(await screen.findByText('O arquivo tem mais de 1 MB.')).toBeTruthy();
  expect(api(fetchMock)).toHaveLength(0);
});

it('does not offer import when there is nothing new', async () => {
  const empty: Preview = {
    version: 1,
    plan: {
      groups: [],
      services: [],
      issues: [],
      summary: { newGroups: 0, newServices: 0, duplicates: 0, errors: 0, warnings: 0 },
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => empty })),
  );
  render(<ConfigTransfer onImported={() => {}} />);
  choose(screen.getByLabelText('Arquivo de configuração'), file('x'));
  const button = await screen.findByRole('button', { name: 'Nada novo para importar.' });
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

it('sends selected source, regenerates preview on format switch, and hides private network option', async () => {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith('preview') ? preview : { created: 1, plan: preview.plan }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ConfigTransfer onImported={() => {}} />);
  choose(screen.getByLabelText('Arquivo de configuração'), file('- Casa: []'));
  await screen.findByRole('checkbox', { name: /Manter as permissões/ });
  await chooseSelectOption('Formato do arquivo', /Homepage/);
  await waitFor(() => expect(api(fetchMock)).toHaveLength(2));
  const [, previewInit] = api(fetchMock)[1] as unknown as [string, { body: string }];
  expect(JSON.parse(previewInit.body)).toEqual({ content: '- Casa: []', source: 'homepage' });
  expect(screen.queryByRole('checkbox', { name: /Manter as permissões/ })).toBeNull();
  expect(screen.getByText(/Monitoramento, widgets, vínculos com Docker/)).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Importar (1)' }));
  await waitFor(() => expect(api(fetchMock)).toHaveLength(3));
  const [, applyInit] = api(fetchMock)[2] as unknown as [string, { body: string }];
  expect(JSON.parse(applyInit.body)).toMatchObject({ source: 'homepage', keepPrivate: false });
});

it('says a broken file cannot be imported instead of previewing zero cards', async () => {
  const broken: Preview = {
    version: 1,
    plan: {
      groups: [],
      services: [],
      issues: [{ code: 'invalid-syntax', severity: 'error', path: '' }],
      summary: { newGroups: 0, newServices: 0, duplicates: 0, errors: 1, warnings: 0 },
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => broken })),
  );
  render(<ConfigTransfer onImported={() => {}} />);
  choose(screen.getByLabelText('Arquivo de configuração'), file('{'));
  expect(await screen.findByText('Este arquivo não pode ser importado')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('YAML');
});
