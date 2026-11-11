import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { summarizeProxmox } from './proxmox-summary.js';
import { getAuthorizedResponse } from './network-request.js';

vi.mock('./network-request.js', () => ({ getAuthorizedResponse: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

const inventory = [
  {
    type: 'node',
    node: 'pve1',
    status: 'online',
    cpu: 0.1,
    maxcpu: 4,
    mem: 4,
    maxmem: 8,
    disk: 10,
    maxdisk: 100,
  },
  {
    type: 'node',
    node: 'pve2',
    status: 'online',
    cpu: 0.5,
    maxcpu: 4,
    mem: 2,
    maxmem: 8,
    disk: 30,
    maxdisk: 100,
  },
  { type: 'node', node: 'pve3', status: 'offline', cpu: 1, maxcpu: 64, mem: 99, maxmem: 99 },
  { type: 'qemu', name: 'segredo-vm', status: 'running' },
  { type: 'qemu', name: 'parada', status: 'stopped' },
  { type: 'qemu', name: 'modelo', status: 'stopped', template: 1 },
  { type: 'lxc', name: 'ct1', status: 'running' },
  { type: 'lxc', name: 'ct2', status: 'running' },
  { type: 'storage', storage: 'local' },
  null,
  'lixo',
];

it('summarizes inventory into aggregated numbers, ignoring templates, offline nodes and garbage', () => {
  expect(summarizeProxmox(inventory)).toEqual({
    vms: { running: 1, total: 2 },
    containers: { running: 2, total: 2 },
    cpu: 30,
    memory: 38,
    disk: 20,
  });
  expect(summarizeProxmox({})).toEqual({
    vms: { running: 0, total: 0 },
    containers: { running: 0, total: 0 },
    cpu: null,
    memory: null,
    disk: null,
  });
  expect(
    summarizeProxmox([{ type: 'node', status: 'online', cpu: 5, maxcpu: 2, mem: 9, maxmem: 3 }]),
  ).toMatchObject({ cpu: 100, memory: 100 });
});

function mockProxmox(data: unknown) {
  const mock = vi.mocked(getAuthorizedResponse);
  mock.mockClear();
  return mock.mockResolvedValue({ status: 200, body: JSON.stringify({ data }) });
}

it('migrates legacy Proxmox while preserving card widgets and aggregate data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proxmox-widget-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup('password-for-tests');
  const cookie = `homora_session=${auth.login('password-for-tests', 'test')}`;
  const headers = { origin: 'http://localhost:5173', cookie };
  const vault = createVault(path);
  const app = createApp(db.db, 5173, auth, vault);
  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  try {
    const card = (
      await send('POST', '/api/services', {
        name: 'Proxmox',
        url: 'https://pve.example:8006',
        category: 'Infra',
        description: '',
      })
    ).json();

    const early = await send('POST', '/api/widgets', { source: 'proxmox', name: 'Cluster' });
    expect(early.statusCode).toBe(404);
    expect(early.json().code).toBe('proxmox-not-configured');
    expect((await send('GET', '/api/widgets')).json()).toEqual([]);

    await vault.save({ url: 'https://pve.example:8006', tokenId: 'user@pve!homora', secret: 'x' });
    expect(
      (await send('POST', '/api/widgets', { source: 'proxmox', integrationId: 1, name: 'A' }))
        .statusCode,
    ).toBe(400);
    expect((await send('POST', '/api/widgets', { name: 'A' })).statusCode).toBe(400);
    const created = await send('POST', '/api/widgets', {
      source: 'proxmox',
      name: 'Cluster',
      serviceId: card.id,
    });
    expect(created.statusCode).toBe(201);
    const widget = created.json();
    expect(widget).toMatchObject({ type: 'proxmox', serviceId: card.id });
    const again = (await send('POST', '/api/widgets', { source: 'proxmox', name: 'Outro' })).json();
    expect(again.integrationId).toBe(widget.integrationId);

    expect((await send('GET', '/api/connections')).json()).toMatchObject([
      { id: widget.integrationId, type: 'proxmox' },
    ]);
    expect(
      (await send('PUT', `/api/connections/${widget.integrationId}`, { name: 'Cluster principal' }))
        .statusCode,
    ).toBe(200);
    expect((await send('DELETE', `/api/connections/${widget.integrationId}`)).statusCode).toBe(409);

    const spy = mockProxmox(inventory);
    const data = await send('GET', `/api/connections/${widget.integrationId}/data`);
    expect(data.statusCode).toBe(200);
    expect(data.json().data).toEqual({
      vms: { running: 1, total: 2 },
      containers: { running: 2, total: 2 },
      cpu: 30,
      memory: 38,
      disk: 20,
    });
    expect(data.body).not.toContain('segredo-vm');
    expect(data.body).not.toContain('pve1');
    await send('GET', `/api/connections/${widget.integrationId}/data`);
    expect(spy).toHaveBeenCalledTimes(1);

    await send('PUT', `/api/connections/${widget.integrationId}`, {
      tokenId: 'user@pve!outro',
      secret: 'y',
    });
    await send('GET', `/api/connections/${widget.integrationId}/data`);
    expect(spy).toHaveBeenCalledTimes(2);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
