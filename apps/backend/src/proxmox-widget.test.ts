import { EventEmitter } from 'node:events';
import https from 'node:https';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@homora/db';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { summarizeProxmox } from './proxmox-summary.js';

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

it('resume o inventário em números agregados, ignorando modelos, nós offline e lixo', () => {
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
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  return vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setEncoding: vi.fn(),
      resume: vi.fn(),
    });
    queueMicrotask(() => {
      (args[2] as (res: typeof response) => void)(response);
      response.emit('data', JSON.stringify({ data }));
      response.emit('end');
    });
    return request as unknown as ReturnType<typeof https.get>;
  });
}

it('liga o Proxmox legado a um card sem expor recursos nem permitir editar a linha ponte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proxmox-widget-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  auth.setup('senha-para-testes');
  const cookie = `homora_session=${auth.login('senha-para-testes', 'test')}`;
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

    expect(await send('GET', '/api/connections').then((r) => r.json())).toEqual([]);
    for (const [method, url] of [
      ['PUT', `/api/connections/${widget.integrationId}`],
      ['DELETE', `/api/connections/${widget.integrationId}`],
      ['POST', `/api/connections/${widget.integrationId}/test`],
    ] as const)
      expect((await send(method, url, { name: 'x' })).statusCode).toBe(404);

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

    await vault.save({ url: 'https://pve.example:8006', tokenId: 'user@pve!outro', secret: 'x' });
    await send('GET', `/api/connections/${widget.integrationId}/data`);
    expect(spy).toHaveBeenCalledTimes(2);
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
