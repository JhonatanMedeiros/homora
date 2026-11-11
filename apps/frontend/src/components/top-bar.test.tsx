// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { TopBar } from './top-bar';
import { widgetStats } from '@/features/connections/connection-model';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubApi(routes: Record<string, () => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => routes[url]?.() ?? new Response('{}', { status: 404 })),
  );
}
const json = (body: unknown) => () => new Response(JSON.stringify(body));

it('displays CPU, memory, and disk from Proxmox without exposing VMs and containers', async () => {
  stubApi({
    '/api/widgets': json([
      { id: 1, integrationId: 9, type: 'proxmox', name: 'PVE', serviceId: null },
    ]),
    '/api/connections/9/data': json({
      data: {
        vms: { running: 1, total: 2 },
        containers: { running: 0, total: 0 },
        cpu: 12,
        memory: 40,
        disk: 55,
      },
    }),
  });
  render(<TopBar />);
  expect(screen.getByRole('region', { name: 'Data, hora e recursos do sistema' })).toBeTruthy();
  await waitFor(() => expect(screen.getByText('55%')).toBeTruthy());
  expect(screen.getByText('12%')).toBeTruthy();
  expect(screen.getByText('40%')).toBeTruthy();
  expect(screen.queryByText('VMs')).toBeNull();
});

it('displays clock only when no Proxmox widget exists', async () => {
  stubApi({ '/api/widgets': json([]) });
  render(<TopBar />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(document.querySelector('time')).toBeTruthy();
  expect(screen.queryByText('Recursos do sistema indisponíveis')).toBeNull();
});

it('warns when system resources fail to load', async () => {
  stubApi({
    '/api/widgets': json([
      { id: 1, integrationId: 9, type: 'proxmox', name: 'PVE', serviceId: null },
    ]),
    '/api/connections/9/data': () => new Response('{}', { status: 502 }),
  });
  render(<TopBar />);
  await waitFor(() => expect(screen.getByText('Recursos do sistema indisponíveis')).toBeTruthy());
});

it('accepts Proxmox responses without disk and rejects invalid disk values', () => {
  const base = { vms: { running: 0, total: 0 }, containers: { running: 0, total: 0 } };
  expect(widgetStats('proxmox', { ...base, cpu: 1, memory: 2 })?.some((s) => s.id === 'disk')).toBe(
    false,
  );
  expect(widgetStats('proxmox', { ...base, cpu: 1, memory: 2, disk: 150 })).toBeNull();
});
