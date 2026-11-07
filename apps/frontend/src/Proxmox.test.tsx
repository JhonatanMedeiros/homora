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
