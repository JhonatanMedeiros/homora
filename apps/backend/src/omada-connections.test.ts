import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@homora/db';
import { createVault } from './vault.js';
import { createIntegrationConnections } from './integrations/integration-connections.js';
import * as network from './network-request.js';

// Synthetic values only: nothing here identifies a real Controller, site, device or client.
const input = {
  type: 'omada',
  name: 'Network',
  url: 'https://omada.example.test',
  omadacId: 'cccccccccccccccccccccccccccccccc',
  siteId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  tokenId: 'client-id-SYNTHETIC',
  secret: 'client-secret-SYNTHETIC',
  allowPrivate: true,
};
const envelope = (result: unknown, errorCode = 0) => ({ errorCode, msg: 'Success.', result });
const grid = (rows: unknown[], extra: Record<string, unknown> = {}) =>
  envelope({ totalRows: rows.length, currentPage: 1, currentSize: 50, data: rows, ...extra });
const reply = (url: string, token = 'access-1') => {
  if (url.includes('/openapi/authorize/token'))
    return envelope({
      accessToken: token,
      tokenType: 'bearer',
      expiresIn: 7200,
      refreshToken: 'refresh-SYNTHETIC',
    });
  if (url.includes('/logs/alerts')) return grid([], {});
  if (url.includes('/devices'))
    return grid([{ mac: 'AA-00-00-00-00-01', type: 'gateway', status: 1 }]);
  if (url.includes('/clients'))
    return grid([], { clientStat: { total: 0, wired: 0, wireless: 0 } });
  if (url.includes('/history-enable'))
    return envelope({ clientStatEnable: true, clientsDataEnable: true });
  return grid([{ siteId: input.siteId }]);
};
const expected = {
  clients: { total: 0, wired: 0, wireless: 0 },
  clientCollection: 'enabled',
  devices: {
    ap: {
      total: 0,
      connected: 0,
      disconnected: 0,
      pending: 0,
      heartbeatMissed: 0,
      isolated: 0,
      unknown: 0,
    },
    switch: {
      total: 0,
      connected: 0,
      disconnected: 0,
      pending: 0,
      heartbeatMissed: 0,
      isolated: 0,
      unknown: 0,
    },
    gateway: {
      total: 1,
      connected: 1,
      disconnected: 0,
      pending: 0,
      heartbeatMissed: 0,
      isolated: 0,
      unknown: 0,
    },
    other: 0,
  },
  alerts: { unresolved: 0, windowHours: 24 },
  unavailable: {},
};
function open() {
  const dir = mkdtempSync(join(tmpdir(), 'homora-omada-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const connections = createIntegrationConnections(database.db, createVault(path), () => 1000);
  return {
    connections,
    close: () => (database.close(), rmSync(dir, { recursive: true, force: true })),
  };
}
afterEach(() => vi.restoreAllMocks());

it('logs in with the fixed client-credentials exchange and reads with the AccessToken format', async () => {
  const { connections, close } = open();
  const send = vi.spyOn(network, 'getAuthorizedResponse').mockImplementation(async (url) => ({
    status: 200,
    body: JSON.stringify(reply(String(url))),
  }));
  try {
    const row = await connections.createConnection(input);
    expect(JSON.stringify(row)).not.toMatch(/client-secret-SYNTHETIC|client-id-SYNTHETIC/);
    expect((await connections.connectionData(row.id))?.data).toEqual(expected);
    const logins = send.mock.calls.filter(([url]) => String(url).includes('/authorize/token'));
    expect(logins).toHaveLength(1);
    expect(String(logins[0]![0])).toBe(
      'https://omada.example.test/openapi/authorize/token?grant_type=client_credentials',
    );
    expect(JSON.parse(logins[0]![2]!.jsonBody!)).toEqual({
      omadacId: input.omadacId,
      client_id: input.tokenId,
      client_secret: input.secret,
    });
    expect(logins[0]![2]!.sensitiveBody).toBe(true);
    const reads = send.mock.calls.filter(([url]) => !String(url).includes('/authorize/token'));
    expect(reads.length).toBeGreaterThanOrEqual(5);
    for (const [url, policy, options] of reads) {
      expect(String(url)).toContain(`/openapi/v1/${input.omadacId}/`);
      expect(options?.jsonBody).toBeUndefined();
      expect(options?.headers).toEqual({ authorization: 'AccessToken=access-1' });
      expect(policy).toMatchObject({ origins: ['https://omada.example.test'], allowPrivate: true });
    }
    // The cached observation is reused; an explicit refresh logs in again only after expiry.
    await connections.connectionData(row.id, true);
    expect(
      send.mock.calls.filter(([url]) => String(url).includes('/authorize/token')),
    ).toHaveLength(1);
  } finally {
    close();
  }
});

it('never lets the token, refresh token or credentials reach results or errors', async () => {
  const { connections, close } = open();
  vi.spyOn(network, 'getAuthorizedResponse').mockImplementation(async (url) => ({
    status: 200,
    body: JSON.stringify(reply(String(url))),
  }));
  try {
    const row = await connections.createConnection(input);
    const data = JSON.stringify(await connections.connectionData(row.id));
    expect(data).not.toMatch(/access-1|refresh-SYNTHETIC|client-secret|client-id|AA-00/);
  } finally {
    close();
  }
});

it('reports rejected credentials (HTTP 200 with an error code) with a fixed error and backs off', async () => {
  const { connections, close } = open();
  const send = vi.spyOn(network, 'getAuthorizedResponse').mockResolvedValue({
    status: 200,
    body: JSON.stringify({ errorCode: -44106, msg: 'client-secret-SYNTHETIC unknown' }),
  });
  try {
    const row = await connections.createConnection(input);
    const error = await connections.connectionData(row.id).catch((e: unknown) => e as Error);
    expect((error as Error).message).toBe('Omada rejected the credentials or permissions.');
    await expect(connections.connectionData(row.id, true)).rejects.toThrow(
      'temporarily unavailable',
    );
    expect(send).toHaveBeenCalledTimes(1);
    await expect(connections.testConnection(row.id)).rejects.toThrow('Omada rejected');
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    close();
  }
});

it('renews after the token expires and after a 401, and requires a new secret when identity changes', async () => {
  const { connections, close } = open();
  let issued = 0;
  let reject = false;
  const send = vi
    .spyOn(network, 'getAuthorizedResponse')
    .mockImplementation(async (url, _p, options) => {
      if (String(url).includes('/authorize/token')) {
        issued++;
        return { status: 200, body: JSON.stringify(reply(String(url), `access-${issued}`)) };
      }
      if (reject && options?.headers?.authorization === 'AccessToken=access-1')
        return { status: 401, body: '' };
      return { status: 200, body: JSON.stringify(reply(String(url))) };
    });
  try {
    const row = await connections.createConnection(input);
    await connections.connectionData(row.id);
    reject = true;
    await connections.connectionData(row.id, true);
    expect(issued).toBe(2);
    expect(send.mock.calls.at(-1)?.[2]?.headers).toEqual({ authorization: 'AccessToken=access-2' });
    await expect(
      connections.updateConnection(row.id, { omadacId: 'dddddddddddddddddddddddddddddddd' }),
    ).rejects.toThrow('Enter the secret again');
    await expect(
      connections.updateConnection(row.id, { tokenId: 'another-client-id' }),
    ).rejects.toThrow('Enter the secret again');
    await connections.updateConnection(row.id, { siteId: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
  } finally {
    close();
  }
});

it('rejects invalid configuration without any network access', async () => {
  const { connections, close } = open();
  const send = vi.spyOn(network, 'getAuthorizedResponse');
  try {
    for (const bad of [
      { url: 'http://omada.example.test' },
      { omadacId: '../etc' },
      { siteId: 'a/b' },
      { siteId: 'a?b=1' },
      { tokenId: '' },
      { secret: '' },
    ])
      await expect(connections.createConnection({ ...input, ...bad })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  } finally {
    close();
  }
});
