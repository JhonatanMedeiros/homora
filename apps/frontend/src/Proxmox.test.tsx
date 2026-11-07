// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Proxmox } from './Proxmox';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('testa a integração existente sem salvar os dados', async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/status'))
      return { ok: true, json: async () => ({ configured: true, hasCa: true }) };
    if (url.endsWith('/test')) return { ok: true, json: async () => ({ ok: true }) };
    return { ok: true, json: async () => ({ data: [] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<Proxmox />);
  fireEvent.click(await screen.findByRole('button', { name: 'Alterar integração' }));
  expect(screen.getByLabelText('Remover CA importada')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Testar conexão' }));
  expect(await screen.findByText('Conexão com o Proxmox realizada com sucesso.')).toBeTruthy();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/config'))).toBe(false);
});

it('mostra o diagnóstico retornado pela API', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/status')
        ? { ok: true, json: async () => ({ configured: true }) }
        : { ok: false, json: async () => ({ error: 'Certificado TLS não confiável.' }) },
    ),
  );
  render(<Proxmox />);
  expect(await screen.findByText('Certificado TLS não confiável.')).toBeTruthy();
});

it('exibe data da consulta e força atualização ao solicitar', async () => {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith('/status')
      ? { ok: true, json: async () => ({ configured: true }) }
      : { ok: true, json: async () => ({ data: [], checkedAt: '2026-01-01T12:00:00.000Z' }) },
  );
  vi.stubGlobal('fetch', fetchMock);
  render(<Proxmox />);
  expect(await screen.findByText(/Última atualização:/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
  expect(fetchMock.mock.calls.some(([url]) => url === '/api/proxmox/resources?refresh=true')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Alterar integração' }));
  expect(screen.getByText(/Ao alterar a URL ou o ID do token/)).toBeTruthy();
});

it('mostra uso de CPU e memória dos nós e a lista de máquinas', async () => {
  const gib = 1024 ** 3;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url.endsWith('/status')
        ? { ok: true, json: async () => ({ configured: true }) }
        : {
            ok: true,
            json: async () => ({
              data: [
                {
                  type: 'node',
                  name: 'pve',
                  status: 'online',
                  cpu: 0.24,
                  mem: 8 * gib,
                  maxmem: 32 * gib,
                },
                { type: 'qemu', name: 'jellyfin', node: 'pve', status: 'running' },
                { type: 'lxc', name: 'backup', node: 'pve', status: 'stopped' },
              ],
            }),
          },
    ),
  );
  render(<Proxmox />);
  expect(await screen.findByText('24%')).toBeTruthy();
  expect(screen.getByText('8 de 32 GB')).toBeTruthy();
  expect(screen.getByText('jellyfin')).toBeTruthy();
  expect(screen.getByText('stopped')).toBeTruthy();
  expect(screen.getByText(/1 nó · 1 VMs · 1 containers/)).toBeTruthy();
});
