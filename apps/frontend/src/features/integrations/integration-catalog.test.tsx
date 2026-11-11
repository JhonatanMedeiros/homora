// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntegrationCatalog } from './integration-catalog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('displays catalog returned by the API', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => [{ type: 'proxmox', label: 'Proxmox VE', capabilities: ['inventory'] }],
    })),
  );
  render(<IntegrationCatalog />);
  expect(await screen.findByText('Proxmox VE')).toBeTruthy();
});

it('allows retrying after failure', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => [] });
  vi.stubGlobal('fetch', fetchMock);
  render(<IntegrationCatalog />);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Não foi possível carregar o catálogo.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Nenhuma integração disponível.')).toBeTruthy();
});
