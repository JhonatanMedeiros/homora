import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createDatabase } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { createProxmoxConnectionAdapter } from '@homora/integrations/proxmox/testing';
import { integrationRegistry } from './integration-registry.js';

const config = { url: 'https://pve.example:8006', tokenId: 'user@pve!test', secret: 'test' };
const cluster = [
  {
    type: 'node',
    node: 'pve1',
    status: 'online',
    cpu: 0.5,
    maxcpu: 4,
    mem: 2,
    maxmem: 4,
    disk: 1,
    maxdisk: 10,
  },
  {
    type: 'node',
    node: 'pve2',
    status: 'online',
    cpu: 0.1,
    maxcpu: 8,
    mem: 1,
    maxmem: 8,
    disk: 5,
    maxdisk: 10,
  },
  { type: 'node', node: 'pve3', status: 'offline' },
  { type: 'qemu', node: 'pve1', vmid: 100, status: 'running', name: 'a' },
  { type: 'qemu', node: 'pve2', vmid: 101, status: 'running', name: 'b' },
  { type: 'qemu', node: 'pve2', vmid: 102, status: 'stopped', name: 'c' },
  { type: 'lxc', node: 'pve2', vmid: 200, status: 'running', name: 'd' },
  { type: 'lxc', node: 'pve3', vmid: 201, status: 'stopped', name: 'e' },
  { type: 'storage', node: 'pve1', storage: 'local' },
];
const adapterFor = (status = 200, body: unknown = { data: cluster }) =>
  createProxmoxConnectionAdapter(vi.fn(async () => ({ status, body })));

it('keeps the cluster totals when no node is selected', async () => {
  const summary = await adapterFor().collect(config);
  expect(summary.vms).toEqual({ running: 2, total: 3 });
  expect(summary.containers).toEqual({ running: 1, total: 2 });
  const prepared = integrationRegistry.prepare('proxmox', {
    publicConfig: { url: config.url },
    credentials: { tokenId: config.tokenId, secret: config.secret },
    transport: async () => ({ status: 200, body: { data: cluster } }),
  });
  expect(await prepared()).toEqual(summary);
});

it('scopes the totals to one node and uses only that node for CPU, memory and disk', async () => {
  const summary = await adapterFor().collectNode(config, 'pve2');
  expect(summary).toEqual({
    vms: { running: 1, total: 2 },
    containers: { running: 1, total: 1 },
    cpu: 10,
    memory: 13,
    disk: 50,
  });
  expect(JSON.stringify(summary)).not.toContain('pve2');
});

it('reports a missing or offline node as unavailable and never falls back to the cluster', async () => {
  expect(await adapterFor().collectNode(config, 'gone')).toEqual({ unavailable: true });
  expect(await adapterFor().collectNode(config, 'pve3')).toEqual({ unavailable: true });
  const prepared = integrationRegistry.prepare('proxmox', {
    publicConfig: { url: config.url, node: 'gone' },
    credentials: { tokenId: config.tokenId, secret: config.secret },
    transport: async () => ({ status: 200, body: { data: cluster } }),
  });
  expect(await prepared()).toEqual({ unavailable: true });
});

it('still fails on permission errors and invalid responses instead of reporting a scope', async () => {
  for (const status of [401, 403, 500])
    await expect(adapterFor(status, { data: [] }).collectNode(config, 'pve1')).rejects.toThrow();
  await expect(adapterFor(200, {}).collectNode(config, 'pve1')).rejects.toThrow('Invalid Proxmox');
});

it('rejects a malformed node name before any request', () => {
  const transport = vi.fn();
  for (const node of ['../x', 'a b', 'a/b', 'a'.repeat(64), '-x'])
    expect(() =>
      integrationRegistry.prepare('proxmox', {
        publicConfig: { url: config.url, node },
        credentials: { tokenId: config.tokenId, secret: config.secret },
        transport,
      }),
    ).toThrow();
  expect(transport).not.toHaveBeenCalled();
});

it('stores, changes and clears the node through the API without touching the secret', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-node-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, createVault(path));
  try {
    const created = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers,
      payload: {
        type: 'proxmox',
        name: 'PVE',
        url: config.url,
        tokenId: config.tokenId,
        secret: 'secret-xyz',
        node: 'pve2',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ node: 'pve2', hasSecret: true });
    expect(created.body).not.toContain('secret-xyz');
    const id = created.json().id;
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/connections/${id}`,
      headers,
      payload: { node: '../x' },
    });
    expect(bad.statusCode).toBe(400);
    const cleared = await app.inject({
      method: 'PUT',
      url: `/api/connections/${id}`,
      headers,
      payload: { node: '' },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).not.toHaveProperty('node');
    expect(cleared.json()).toMatchObject({ hasSecret: true });
    const listed = (
      await app.inject({ method: 'GET', url: '/api/connections', headers: { cookie } })
    ).json() as { id: number; node?: string }[];
    expect(listed.find((item) => item.id === id)).not.toHaveProperty('node');
    const kept = await app.inject({
      method: 'PUT',
      url: `/api/connections/${id}`,
      headers,
      payload: { name: 'Renamed' },
    });
    expect(kept.json()).toMatchObject({ name: 'Renamed', hasSecret: true });
  } finally {
    await app.close();
    db.close?.();
  }
});
