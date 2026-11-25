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
      { name: 'pve1', status: 'online', metrics: { cpu: 0.1 } },
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
    expect((await send('PUT', `/api/services/${id}/host`, { host })).json()).toEqual({
      host,
      hostExternal: false,
    });
    expect((await send('PUT', `/api/services/${id}/host`, { host: null })).json()).toEqual({
      host: null,
      hostExternal: false,
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

it('accepts a safe separate monitoring target in service proposals', () => {
  const service = { name: 'App', url: 'https://app.example', category: 'Home', description: '' };
  expect(
    serviceProposalSchema.safeParse({
      op: 'create',
      service: { ...service, checkUrl: 'http://192.168.1.10/health' },
    }).success,
  ).toBe(true);
  for (const checkUrl of [
    'http://user:pass@example.com/',
    'http://example.com/?token=secret',
    'file:///etc/passwd',
  ]) {
    expect(
      serviceProposalSchema.safeParse({ op: 'create', service: { ...service, checkUrl } }).success,
    ).toBe(false);
  }
});

it('marks a card as not running on a guest, and a link or a bad body never leaves both set', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-host-external-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, createVault(path));
  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  vi.mocked(getAuthorizedResponse).mockResolvedValue({
    status: 200,
    body: JSON.stringify({ data: resources() }),
  });
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
    const host = { connectionId: proxmox.id, node: 'pve1', vmid: 101, type: 'lxc' };
    const base = { name: 'Cloudflare', url: 'https://cf.test', category: 'Network' };
    const id = (await send('POST', '/api/services', base)).json().id;
    const flag = async () => (await send('GET', '/api/services')).json()[0].hostExternal;
    const externalBody = { host: null, external: true };

    // New cards are not external.
    expect(await flag()).toBe(false);

    // Marking needs a session, no link in the same body, and a card that exists.
    const anonymous = await app.inject({
      method: 'PUT',
      url: `/api/services/${id}/host`,
      headers: { origin: 'http://localhost:5173' },
      payload: externalBody,
    });
    expect(anonymous.statusCode).toBe(401);
    expect(
      (await send('PUT', `/api/services/${id}/host`, { host, external: true })).statusCode,
    ).toBe(400);
    expect(
      (await send('PUT', `/api/services/${id}/host`, { host: null, external: 'yes' })).statusCode,
    ).toBe(400);
    expect((await send('PUT', '/api/services/999/host', externalBody)).statusCode).toBe(404);
    expect(await flag()).toBe(false);

    const marked = await send('PUT', `/api/services/${id}/host`, externalBody);
    expect(marked.json()).toEqual({ host: null, hostExternal: true });
    expect(await flag()).toBe(true);

    // Editing the card without a host, or with `host: null`, keeps the mark.
    await send('PUT', `/api/services/${id}`, { ...base, name: 'Cloudflare 2' });
    await send('PUT', `/api/services/${id}`, { ...base, host: null });
    expect(await flag()).toBe(true);

    // Unlinking without `external` keeps it; `external: false` clears it.
    await send('PUT', `/api/services/${id}/host`, { host: null });
    expect(await flag()).toBe(true);
    await send('PUT', `/api/services/${id}/host`, { host: null, external: false });
    expect(await flag()).toBe(false);

    // A link clears the mark, whether it comes from the map or from the card form.
    await send('PUT', `/api/services/${id}/host`, externalBody);
    await send('PUT', `/api/services/${id}/host`, { host });
    const [linked] = (await send('GET', '/api/services')).json();
    expect(linked.host).toEqual(host);
    expect(linked.hostExternal).toBe(false);
    await send('PUT', `/api/services/${id}/host`, externalBody);
    expect((await send('PUT', `/api/services/${id}`, { ...base, host })).json().host).toEqual(host);
    expect(await flag()).toBe(false);

    // The change is audited as its own event.
    await send('PUT', `/api/services/${id}/host`, externalBody);
    const audit = await send('GET', '/api/activity');
    if (audit.statusCode === 200) expect(audit.body).toContain('service-host-external');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
