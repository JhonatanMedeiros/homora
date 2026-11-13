import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it, vi } from 'vitest';
import { createIntegrationConnections } from './integration-connections.js';
import { migrateLegacyProxmoxAtStartup } from './legacy-proxmox.js';
import { createVault } from './vault.js';
import { getAuthorizedResponse } from './network-request.js';

vi.mock('./network-request.js', () => ({ getAuthorizedResponse: vi.fn() }));

it('migrates the legacy connection without changing widget IDs or exposing credentials', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proxmox-migration-'));
  const path = join(dir, 'data.sqlite');
  const database = createDatabase(path);
  const sqlite = getSqliteHandle(database.db);
  const vault = createVault(path);
  try {
    await vault.save({
      url: 'https://old.example:8006',
      tokenId: 'old@pve!id',
      secret: 'legacy-test-secret',
    });
    sqlite.exec(
      "INSERT INTO integration_instances(id,type,name,public_config) VALUES(42,'proxmox','Proxmox VE','{}'); INSERT INTO integration_widgets(id,integration_id,type,name,public_config) VALUES(9,42,'proxmox','Cluster','{}')",
    );
    const connections = createIntegrationConnections(database.db, vault);
    const list = await connections.listConnections();
    expect(list).toMatchObject([
      {
        id: 42,
        type: 'proxmox',
        url: 'https://old.example:8006',
        allowPrivate: true,
        hasSecret: true,
      },
    ]);
    expect(JSON.stringify(list)).not.toContain('legacy-test-secret');
    expect(JSON.stringify(list)).not.toContain('old@pve!id');
    expect((await connections.listWidgets())[0]).toMatchObject({ id: 9, integrationId: 42 });
    expect(readFileSync(path).includes('legacy-test-secret')).toBe(false);
    expect(await connections.listConnections()).toHaveLength(1);
    vi.mocked(getAuthorizedResponse).mockResolvedValue({
      status: 200,
      body: JSON.stringify({ data: [] }),
    });
    expect(await connections.connectionData(42)).toMatchObject({
      data: { vms: { running: 0, total: 0 } },
    });
    expect(getAuthorizedResponse).toHaveBeenCalledWith(
      'https://old.example:8006/api2/json/cluster/resources',
      { origins: ['https://old.example:8006'], allowPrivate: true },
      expect.objectContaining({
        headers: { authorization: 'PVEAPIToken=old@pve!id=legacy-test-secret' },
      }),
    );
    expect(await connections.deleteConnection(42)).toBe('has-widgets');
    await connections.deleteWidget(9);
    expect(await connections.deleteConnection(42)).toBe('deleted');
    expect(await connections.listConnections()).toEqual([]);
    sqlite
      .prepare('INSERT INTO integration_instances(id,type,name,public_config) VALUES(42,?,?,?)')
      .run(
        'jellyfin',
        'Replacement',
        JSON.stringify({ url: 'https://media.example', allowPrivate: false }),
      );
    await expect(connections.createWidget({ source: 'proxmox' }, 'Old')).rejects.toMatchObject({
      code: 'proxmox-not-configured',
    });
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('supports independent Proxmox connections without a legacy configuration', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proxmox-multiple-'));
  const path = join(dir, 'data.sqlite');
  const database = createDatabase(path);
  try {
    const connections = createIntegrationConnections(database.db, createVault(path));
    const first = await connections.createConnection({
      type: 'proxmox',
      name: 'One',
      url: 'https://one.example',
      tokenId: 'user@pve!one',
      secret: 'secret-one',
      allowPrivate: true,
    });
    const second = await connections.createConnection({
      type: 'proxmox',
      name: 'Two',
      url: 'https://two.example',
      tokenId: 'user@pve!two',
      secret: 'secret-two',
    });
    expect(first.id).not.toBe(second.id);
    expect(await connections.listConnections()).toHaveLength(2);
    vi.mocked(getAuthorizedResponse)
      .mockReset()
      .mockResolvedValue({ status: 200, body: JSON.stringify({ data: [] }) });
    await connections.connectionData(first.id);
    await connections.connectionData(second.id);
    expect(
      vi
        .mocked(getAuthorizedResponse)
        .mock.calls.map(([url, policy]) => [url, policy.allowPrivate]),
    ).toEqual([
      ['https://one.example/api2/json/cluster/resources', true],
      ['https://two.example/api2/json/cluster/resources', false],
    ]);
    await expect(
      connections.updateConnection(first.id, { tokenId: 'user@pve!changed' }),
    ).rejects.toMatchObject({ code: 'secret-required' });
    await expect(
      connections.createConnection({
        type: 'proxmox',
        name: 'Bad',
        url: 'http://bad.example',
        tokenId: 'user@pve!bad',
        secret: 'secret',
      }),
    ).rejects.toThrow();
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('migrates a legacy connection without widgets and survives reopening the database', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proxmox-no-widgets-'));
  const path = join(dir, 'data.sqlite');
  let database = createDatabase(path);
  try {
    await createVault(path).save({
      url: 'https://old.example',
      tokenId: 'user@pve!id',
      secret: 'secret',
    });
    const initial = await createIntegrationConnections(
      database.db,
      createVault(path),
    ).listConnections();
    expect(initial).toHaveLength(1);
    database.close();
    database = createDatabase(path);
    const restored = await createIntegrationConnections(
      database.db,
      createVault(path),
    ).listConnections();
    expect(restored).toEqual(initial);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('rolls back the migration if the legacy key is missing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proxmox-no-key-'));
  const path = join(dir, 'data.sqlite');
  const database = createDatabase(path);
  try {
    const vault = createVault(path);
    await vault.save({ url: 'https://old.example', tokenId: 'user@pve!id', secret: 'secret' });
    const sqlite = getSqliteHandle(database.db);
    sqlite.exec(
      "INSERT INTO integration_instances(id,type,name,public_config) VALUES(42,'proxmox','Legacy','{}')",
    );
    unlinkSync(`${path}.key`);
    await expect(
      createIntegrationConnections(database.db, vault).listConnections(),
    ).rejects.toThrow();
    expect(
      sqlite
        .prepare('SELECT public_config,secret_ref FROM integration_instances WHERE id=42')
        .get(),
    ).toMatchObject({ public_config: '{}', secret_ref: null });
    expect(sqlite.prepare('SELECT name FROM integration_migrations').all()).toHaveLength(0);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function startupFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proxmox-startup-'));
  const path = join(dir, 'data.sqlite');
  const database = createDatabase(path);
  return {
    dir,
    path,
    database,
    sqlite: getSqliteHandle(database.db),
    vault: createVault(path),
    cleanup() {
      database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
const legacy = { url: 'https://old.example:8006', tokenId: 'user@pve!id', secret: 'legacy-secret' };

it('migrates at startup, keeps the file as backup and changes nothing on a second start', async () => {
  const f = startupFixture();
  try {
    await f.vault.save(legacy);
    const before = readFileSync(`${f.path}.proxmox`, 'utf8');
    const log = vi.fn();
    migrateLegacyProxmoxAtStartup(f.database.db, f.vault, log);
    const snapshot = () => ({
      instances: f.sqlite.prepare('SELECT * FROM integration_instances').all(),
      markers: f.sqlite.prepare('SELECT name FROM integration_migrations').all(),
    });
    const first = snapshot();
    expect(first.instances).toHaveLength(1);
    expect(first.markers).toEqual([
      { name: `legacy-proxmox:${(first.instances[0] as { id: number }).id}` },
    ]);
    expect(first.instances[0]).toMatchObject({
      public_config: JSON.stringify({ url: 'https://old.example:8006', allowPrivate: true }),
      certificate_ref: 'secret',
    });
    expect(readFileSync(`${f.path}.proxmox`, 'utf8')).toBe(before);
    migrateLegacyProxmoxAtStartup(f.database.db, f.vault, log);
    expect(snapshot()).toEqual(first);
    expect(log).not.toHaveBeenCalled();
  } finally {
    f.cleanup();
  }
});

it('does not recreate a deleted migrated connection on restart', async () => {
  const f = startupFixture();
  try {
    await f.vault.save(legacy);
    migrateLegacyProxmoxAtStartup(f.database.db, f.vault);
    const connections = createIntegrationConnections(f.database.db, f.vault);
    const [{ id }] = await connections.listConnections();
    expect(await connections.deleteConnection(id)).toBe('deleted');
    migrateLegacyProxmoxAtStartup(f.database.db, f.vault);
    expect(f.sqlite.prepare('SELECT id FROM integration_instances').all()).toEqual([]);
    expect(f.sqlite.prepare('SELECT name FROM integration_migrations').all()).toEqual([
      { name: 'legacy-proxmox:deleted' },
    ]);
  } finally {
    f.cleanup();
  }
});

it('survives a missing key or a corrupt legacy file and leaves the file untouched', async () => {
  const f = startupFixture();
  try {
    await f.vault.save(legacy);
    const before = readFileSync(`${f.path}.proxmox`, 'utf8');
    unlinkSync(`${f.path}.key`);
    const log = vi.fn();
    expect(() => migrateLegacyProxmoxAtStartup(f.database.db, f.vault, log)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).not.toContain('legacy-secret');
    expect(readFileSync(`${f.path}.proxmox`, 'utf8')).toBe(before);
    writeFileSync(`${f.path}.proxmox`, 'not json');
    expect(() => migrateLegacyProxmoxAtStartup(f.database.db, f.vault, log)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(2);
    expect(readFileSync(`${f.path}.proxmox`, 'utf8')).toBe('not json');
    expect(f.sqlite.prepare('SELECT id FROM integration_instances').all()).toEqual([]);
    expect(f.sqlite.prepare('SELECT name FROM integration_migrations').all()).toEqual([]);
  } finally {
    f.cleanup();
  }
});
