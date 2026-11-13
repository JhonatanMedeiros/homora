import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@homora/db';
import { createVault } from './vault.js';
import { createIntegrationConnections } from './integration-connections.js';
import * as network from './network-request.js';

afterEach(() => vi.restoreAllMocks());
it('isolates connections, reuses sessions, and replaces a session when credentials change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-pihole-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const connections = createIntegrationConnections(database.db, createVault(path));
  const send = vi
    .spyOn(network, 'getAuthorizedResponse')
    .mockImplementation(async (url, _policy, options) => {
      if (String(url).endsWith('/api/auth')) {
        const password = JSON.parse(options?.jsonBody ?? '{}').password as string;
        return {
          status: 200,
          body: JSON.stringify({
            session: {
              valid: true,
              sid: password === 'first-password' ? 'sessionA' : 'sessionB',
              validity: 300,
            },
          }),
        };
      }
      if (String(url).endsWith('/api/dns/blocking'))
        return { status: 200, body: JSON.stringify({ blocking: 'enabled' }) };
      return {
        status: 200,
        body: JSON.stringify({
          queries: { total: 10, blocked: 2, percent_blocked: 20 },
          gravity: { domains_being_blocked: 100 },
        }),
      };
    });
  try {
    const first = await connections.createConnection({
      type: 'pi-hole',
      name: 'DNS',
      url: 'https://pihole.example.test',
      secret: 'first-password',
      allowPrivate: true,
    });
    expect(JSON.stringify(first)).not.toContain('first-password');
    expect((await connections.connectionData(first.id))?.data).toEqual({
      queries: 10,
      blocked: 2,
      percent: 20,
      domains: 100,
      blocking: 'enabled',
    });
    await connections.connectionData(first.id, true);
    expect(send.mock.calls.filter(([url]) => String(url).endsWith('/api/auth'))).toHaveLength(1);
    await connections.updateConnection(first.id, { secret: 'second-password' });
    await connections.connectionData(first.id, true);
    expect(send.mock.calls.filter(([url]) => String(url).endsWith('/api/auth'))).toHaveLength(2);
    expect(send.mock.calls.at(-1)?.[2]?.headers).toEqual({ 'x-ftl-sid': 'sessionB' });
    const second = await connections.createConnection({
      type: 'pi-hole',
      name: 'Other',
      url: 'https://pihole.example.test',
      secret: 'first-password',
      allowPrivate: true,
    });
    await connections.connectionData(second.id, true);
    expect(send.mock.calls.at(-1)?.[2]?.headers).toEqual({ 'x-ftl-sid': 'sessionA' });
    expect(send.mock.calls.filter(([url]) => String(url).endsWith('/api/auth'))).toHaveLength(3);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('backs off after a failed login and lets an explicit test retry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-pihole-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const connections = createIntegrationConnections(database.db, createVault(path), () => 1000);
  const send = vi
    .spyOn(network, 'getAuthorizedResponse')
    .mockResolvedValue({ status: 401, body: '' });
  try {
    const row = await connections.createConnection({
      type: 'pi-hole',
      name: 'DNS',
      url: 'https://pihole.example.test',
      secret: 'bad-password',
    });
    await expect(connections.connectionData(row.id)).rejects.toThrow('Could not query Pi-hole.');
    await expect(connections.connectionData(row.id, true)).rejects.toThrow(
      'temporarily unavailable',
    );
    expect(send).toHaveBeenCalledTimes(1);
    await expect(connections.testConnection(row.id)).rejects.toThrow('Could not query Pi-hole.');
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
