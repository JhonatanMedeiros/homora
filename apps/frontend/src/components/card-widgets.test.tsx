// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../App';
import { widgetStats } from '@/features/connections/connection-model';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it('resume cada tipo de integração e rejeita dados fora do formato', () => {
  expect(
    widgetStats('uptime-kuma', { up: 6, down: 7, pending: 0, maintenance: 0, unknown: 0 }),
  ).toEqual([
    { label: 'No ar', value: '6' },
    { label: 'Fora do ar', value: '7' },
  ]);
  expect(
    widgetStats('uptime-kuma', { up: 1, down: 0, pending: 2, maintenance: 0, unknown: 3 })?.map(
      (stat) => stat.label,
    ),
  ).toEqual(['No ar', 'Fora do ar', 'Pendentes', 'Desconhecidos']);
  expect(widgetStats('jellyfin', { name: 'Casa', version: '10.9' })).toHaveLength(2);
  expect(widgetStats('home-assistant', { entityId: 'sensor.a', state: '21' })).toEqual([
    { label: 'Estado', value: '21' },
  ]);
  expect(
    widgetStats('adguard-home', {
      running: true,
      protectionEnabled: false,
      version: 'v0.107',
    })?.map((stat) => stat.value),
  ).toEqual(['ativo', 'desativada', 'v0.107']);
  expect(
    widgetStats('uptime-kuma', { up: -1, down: 0, pending: 0, maintenance: 0, unknown: 0 }),
  ).toBeNull();
  expect(
    widgetStats('proxmox', {
      vms: { running: 1, total: 1 },
      containers: { running: 16, total: 25 },
      cpu: 6,
      memory: 54,
    }),
  ).toEqual([
    { label: 'VMs', value: '1 / 1' },
    { label: 'LXC', value: '16 / 25' },
    { id: 'cpu', label: 'CPU', value: '6%' },
    { id: 'memory', label: 'Mem', value: '54%' },
  ]);
  expect(
    widgetStats('proxmox', {
      vms: { running: 0, total: 0 },
      containers: { running: 0, total: 0 },
      cpu: null,
      memory: null,
    }),
  ).toHaveLength(2);
  expect(widgetStats('proxmox', { vms: 3 })).toBeNull();
  expect(
    widgetStats('proxmox', {
      vms: { running: 0, total: 0 },
      containers: { running: 0, total: 0 },
      cpu: 120,
      memory: null,
    }),
  ).toBeNull();
  expect(widgetStats('jellyfin', { name: 1 })).toBeNull();
  expect(widgetStats('jellyfin', [])).toBeNull();
  expect(widgetStats('jellyfin', null)).toBeNull();
});

it('mostra dados no card, isola a falha de uma conexão e ignora widgets sem card', async () => {
  const services = [
    { id: 1, name: 'Monitor', url: 'http://localhost:3001/', category: 'Infra', description: '' },
    { id: 2, name: 'DNS', url: 'http://localhost:3002/', category: 'Infra', description: '' },
    { id: 3, name: 'Livre', url: 'http://localhost:3003/', category: 'Infra', description: '' },
  ];
  const widgets = [
    { id: 1, integrationId: 10, type: 'uptime-kuma', name: 'Sites', serviceId: 1 },
    { id: 2, integrationId: 11, type: 'adguard-home', name: 'DNS', serviceId: 2 },
    { id: 3, integrationId: 10, type: 'uptime-kuma', name: 'Solto', serviceId: null },
  ];
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(url);
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services') return { ok: true, json: async () => services };
      if (url === '/api/widgets') return { ok: true, json: async () => widgets };
      if (url === '/api/connections/10/data')
        return {
          ok: true,
          json: async () => ({
            data: { up: 6, down: 7, pending: 0, maintenance: 0, unknown: 0 },
            checkedAt: '2026-11-10T12:00:00.000Z',
          }),
        };
      if (url === '/api/connections/11/data') return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  const sites = await screen.findByRole('region', { name: 'Dados de Sites' });
  await waitFor(() => expect(within(sites).getByText('7')).toBeTruthy());
  expect(within(sites).getByText('Fora do ar')).toBeTruthy();
  const dns = screen.getByRole('region', { name: 'Dados de DNS' });
  await waitFor(() => expect(within(dns).getByText('Dados indisponíveis')).toBeTruthy());
  expect(screen.queryByRole('region', { name: 'Dados de Solto' })).toBeNull();
  expect(requested.filter((url) => url === '/api/connections/10/data')).toHaveLength(1);
});

it('mantém os cards quando a lista de widgets falha', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/status')
        return { ok: true, json: async () => ({ configured: true, authenticated: true }) };
      if (url === '/api/services')
        return {
          ok: true,
          json: async () => [
            {
              id: 1,
              name: 'Monitor',
              url: 'http://localhost:3001/',
              category: 'Infra',
              description: '',
            },
          ],
        };
      if (url === '/api/widgets') throw new TypeError('offline');
      return { ok: true, json: async () => [] };
    }),
  );
  render(<App />);
  expect(await screen.findByRole('link', { name: /Monitor/ })).toBeTruthy();
  expect(screen.queryByRole('region', { name: /^Dados de/ })).toBeNull();
});
