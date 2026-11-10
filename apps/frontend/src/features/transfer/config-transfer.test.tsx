// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigTransfer } from './config-transfer';
import type { Preview } from './transfer-model';

afterEach(() => {
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
const file = (text: string, name = 'homora-config.yaml') => new File([text], name);
const choose = (input: HTMLElement, f: File) => fireEvent.change(input, { target: { files: [f] } });

it('oferece os downloads de exportação em YAML e JSON', () => {
  render(<ConfigTransfer onImported={() => {}} />);
  expect(screen.getByRole('link', { name: /Baixar YAML/ }).getAttribute('href')).toBe(
    '/api/config/export?format=yaml',
  );
  expect(screen.getByRole('link', { name: /Baixar JSON/ }).getAttribute('href')).toBe(
    '/api/config/export?format=json',
  );
});

it('mostra a prévia, relata itens ignorados e só grava ao confirmar', async () => {
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
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'Importar (1)' }));
  await waitFor(() => expect(onImported).toHaveBeenCalled());
  const [, init] = fetchMock.mock.calls[1] as unknown as [string, { body: string }];
  expect(JSON.parse(init.body)).toEqual({
    content: 'version: 1',
    keepPrivate: false,
    expectedVersion: 7,
  });
  expect(await screen.findByText('Importação concluída: 1 card adicionado.')).toBeTruthy();
});

it('envia keepPrivate apenas quando o usuário marca a opção', async () => {
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
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [, init] = fetchMock.mock.calls[1] as unknown as [string, { body: string }];
  expect(JSON.parse(init.body).keepPrivate).toBe(true);
});

it('pede nova revisão quando a configuração mudou', async () => {
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

it('recusa arquivos grandes sem chamar o servidor e descarta a prévia', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  render(<ConfigTransfer onImported={() => {}} />);
  const big = file('x');
  Object.defineProperty(big, 'size', { value: 1_000_001 });
  choose(screen.getByLabelText('Arquivo de configuração'), big);
  expect(await screen.findByText('O arquivo tem mais de 1 MB.')).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('não oferece importar quando não há nada novo', async () => {
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
