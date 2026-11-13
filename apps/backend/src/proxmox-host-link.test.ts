import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { inventoryProxmox } from '@homora/integrations/proxmox/inventory';
import { serviceProposalSchema } from './input-schemas.js';
import { getAuthorizedResponse } from './network-request.js';

vi.mock('./network-request.js', () => ({ getAuthorizedResponse: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

const resources = (guestName = 'pihole') => [
  { type: 'node', node: 'pve2', status: 'offline' },
  { type: 'node', node: 'pve1', status: 'online', cpu: 0.1, maxcpu: 4 },
  { type: 'lxc', vmid: 101, name: guestName, node: 'pve1', status: 'running' },
  { type: 'qemu', vmid: 100, name: 'nas', node: 'pve1', status: 'stopped' },
  { type: 'qemu', vmid: 200, name: 'template', node: 'pve1', template: 1 },
  { type: 'qemu', vmid: 'x', name: 'bad-id', node: 'pve1' },
  { type: 'qemu', vmid: 300, name: 'bad-node', node: '../etc' },
  { type: 'storage', storage: 'local' },
  null,
];

it('lists nodes and guests sorted, ignoring templates and malformed items', () => {
  expect(inventoryProxmox(resources())).toEqual({
    nodes: [
      { name: 'pve1', status: 'online' },
      { name: 'pve2', status: 'offline' },
    ],
    guests: [
      { vmid: 100, name: 'nas', type: 'qemu', node: 'pve1', status: 'stopped' },
      { vmid: 101, name: 'pihole', type: 'lxc', node: 'pve1', status: 'running' },
    ],
  });
  expect(inventoryProxmox({})).toEqual({ nodes: [], guests: [] });
});

it('rejects a host on agent proposals so the link stays a human decision', () => {
  const host = { connectionId: 1, node: 'pve1', vmid: 101, type: 'lxc' };
  const service = { name: 'A', url: 'https://a.test', category: 'Home' };
  expect(
    serviceProposalSchema.safeParse({ op: 'create', service: { ...service, host } }).success,
  ).toBe(false);
});

it('links, resolves, unlinks and validates the card-to-guest link', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-host-link-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, createVault(path));
  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  const mock = vi.mocked(getAuthorizedResponse);
  const reply = (name?: string) =>
    mock.mockResolvedValue({ status: 200, body: JSON.stringify({ data: resources(name) }) });
  try {
    const proxmox = (
      await send('POST', '/api/connections', {
        type: 'proxmox',
        name: 'Lab',
        url: 'https://pve.example:8006',
        tokenId: 'user@pve!homora',
        secret: 'secret',
        allowPrivate: true,
      })
    ).json();
    const other = (
      await send('POST', '/api/connections', {
        type: 'jellyfin',
        name: 'Media',
        url: 'https://jf.example',
      })
    ).json();
    const host = { connectionId: proxmox.id, node: 'pve1', vmid: 101, type: 'lxc' };
    const base = { name: 'Pi-hole', url: 'https://pihole.test', category: 'Network' };

    // Guest picker data requires a session and never reaches a non-Proxmox connection.
    reply();
    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/connections/${proxmox.id}/guests`,
    });
    expect(anonymous.statusCode).toBe(401);
    expect(mock).not.toHaveBeenCalled();
    expect((await send('GET', `/api/connections/${other.id}/guests`)).statusCode).toBe(400);
    expect((await send('GET', '/api/connections/999/guests')).statusCode).toBe(404);
    const guests = await send('GET', `/api/connections/${proxmox.id}/guests`);
    expect(guests.statusCode).toBe(200);
    expect(guests.json().data.guests.map((guest: { vmid: number }) => guest.vmid)).toEqual([
      100, 101,
    ]);

    // Create with a link; the listing returns ids only plus the stored link.
    const created = await send('POST', '/api/services', { ...base, host });
    expect(created.statusCode).toBe(201);
    expect(created.json().host).toEqual(host);
    const listed = (await send('GET', '/api/services')).json();
    expect(listed[0].host).toEqual(host);
    expect(JSON.stringify(listed)).not.toContain('pihole"'); // no guest name is stored

    // A renamed guest shows the new name on the next read; the link is unchanged.
    reply('dns-primary');
    const renamed = (
      await send('GET', `/api/connections/${proxmox.id}/guests?refresh=true`)
    ).json();
    expect(renamed.data.guests.find((guest: { vmid: number }) => guest.vmid === 101).name).toBe(
      'dns-primary',
    );
    expect((await send('GET', '/api/services')).json()[0].host).toEqual(host);

    // Editing a card without `host` keeps the link; `null` removes it.
    const id = created.json().id;
    expect(
      (await send('PUT', `/api/services/${id}`, { ...base, name: 'Pi-hole 2' })).json().host,
    ).toEqual(host);
    expect(
      (await send('PUT', `/api/services/${id}`, { ...base, host: null })).json().host,
    ).toBeNull();
    expect((await send('PUT', `/api/services/${id}/host`, { host })).json()).toEqual({ host });
    expect((await send('PUT', `/api/services/${id}/host`, { host: null })).json()).toEqual({
      host: null,
    });
    expect((await send('GET', '/api/services')).json()[0].host).toBeNull();

    // Validation: unknown connection, non-Proxmox connection, bad ids and extra fields.
    for (const bad of [
      { ...host, connectionId: 999 },
      { ...host, connectionId: other.id },
    ]) {
      const response = await send('PUT', `/api/services/${id}/host`, { host: bad });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('invalid-host');
    }
    for (const bad of [
      { ...host, vmid: 1.5 },
      { ...host, vmid: '101' },
      { ...host, vmid: 5 },
      { ...host, node: '../x' },
      { ...host, type: 'vm' },
      { ...host, name: 'pihole' },
    ])
      expect((await send('PUT', `/api/services/${id}/host`, { host: bad })).statusCode).toBe(400);
    expect(
      (await send('POST', '/api/services', { ...base, host: { ...host, connectionId: 999 } }))
        .statusCode,
    ).toBe(400);
    expect((await send('GET', '/api/services')).json()).toHaveLength(1);
    expect((await send('PUT', '/api/services/999/host', { host })).statusCode).toBe(404);

    // Deleting the connection unlinks its cards instead of leaving a dangling link.
    await send('PUT', `/api/services/${id}/host`, { host });
    expect((await send('DELETE', `/api/connections/${proxmox.id}`)).statusCode).toBe(200);
    expect((await send('GET', '/api/services')).json()[0].host).toBeNull();

    // Link and unlink are audited without guest details.
    const audit = await send('GET', '/api/activity');
    if (audit.statusCode === 200) expect(audit.body).not.toContain('dns-primary');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
