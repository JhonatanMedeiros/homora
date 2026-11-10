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
