import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it, vi } from 'vitest';
import { getAuthorizedResponse } from './network-request.js';
import { createIntegrationConnections } from './integration-connections.js';
import { createProposalService } from './proposals.js';
import { createVault } from './vault.js';
import { createMcp } from './mcp.js';

vi.mock('./network-request.js', () => ({ getAuthorizedResponse: vi.fn() }));
it('queries only authorized non-Proxmox integrations through the controlled transport', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-integration-'));
  const database = createDatabase(join(dir, 'db.sqlite'));
  const db = getSqliteHandle(database.db);
  const vault = createVault(join(dir, 'db.sqlite'));
  db.prepare(
    "INSERT INTO integration_instances(id,type,name,public_config) VALUES(1,'jellyfin','Media',?)",
  ).run(JSON.stringify({ url: 'https://media.example', allowPrivate: false }));
  db.prepare(
    "INSERT INTO integration_instances(id,type,name,public_config) VALUES(2,'proxmox','Proxmox','{}')",
  ).run();
  const identity = createProposalService(db).issue('integration-reader', ['integrations:read']);
  process.env.HOMORA_AGENT_TOKEN = identity.token;
  vi.mocked(getAuthorizedResponse).mockResolvedValue({
    status: 200,
    body: JSON.stringify({ ServerName: 'Media', Version: '10.9' }),
  } as Awaited<ReturnType<typeof getAuthorizedResponse>>);
  const connections = createIntegrationConnections(database.db, vault);
  const server = createMcp(db, { connections });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(a), server.connect(b)]);
    const capabilitiesResult = await client.callTool({ name: 'get_homora_capabilities' });
    const capabilities = JSON.parse((capabilitiesResult.content as { text: string }[])[0].text);
    expect(capabilities.tools).toContainEqual(
      expect.objectContaining({
        name: 'test_connection',
        requiredScopes: ['integrations:read'],
        available: true,
      }),
    );
    const response = await client.callTool({
      name: 'get_integration_status',
      arguments: { id: 1 },
    });
    expect(response.isError, JSON.stringify(response)).not.toBe(true);
    expect(JSON.stringify(response)).toContain('10.9');
    expect(vi.mocked(getAuthorizedResponse)).toHaveBeenCalledWith(
      'https://media.example/System/Info/Public',
      { origins: ['https://media.example'], allowPrivate: false },
      expect.any(Object),
    );
    const beforeTest = db
      .prepare('SELECT last_test_at,last_test_result FROM integration_instances WHERE id=1')
      .get();
    const test = await client.callTool({ name: 'test_connection', arguments: { id: 1 } });
    expect(test.isError).not.toBe(true);
    expect(
      db
        .prepare('SELECT last_test_at,last_test_result FROM integration_instances WHERE id=1')
        .get(),
    ).toEqual(beforeTest);
    expect(JSON.stringify(await client.callTool({ name: 'list_integrations' }))).not.toContain(
      'https://media.example',
    );
    vi.mocked(getAuthorizedResponse).mockRejectedValueOnce(new Error('upstream-secret'));
    const failedTest = await client.callTool({ name: 'test_connection', arguments: { id: 1 } });
    expect(failedTest.isError).toBe(true);
    expect(JSON.stringify(failedTest)).not.toContain('upstream-secret');
    expect(
      db
        .prepare('SELECT last_test_at,last_test_result FROM integration_instances WHERE id=1')
        .get(),
    ).toEqual(beforeTest);
    vi.mocked(getAuthorizedResponse).mockClear();
    const proxmox = await client.callTool({ name: 'get_integration_status', arguments: { id: 2 } });
    expect(proxmox.isError).toBe(true);
    expect(getAuthorizedResponse).not.toHaveBeenCalled();
    createProposalService(db).revoke(identity.id);
    expect((await client.callTool({ name: 'test_connection', arguments: { id: 1 } })).isError).toBe(
      true,
    );
    expect((await client.callTool({ name: 'list_integrations', arguments: {} })).isError).toBe(
      true,
    );
  } finally {
    await client.close();
    await server.close();
    database.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    rmSync(dir, { recursive: true, force: true });
  }
});

it('lists and queries independent Proxmox connections without exposing their credentials', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-proxmox-connections-'));
  const path = join(dir, 'db.sqlite');
  const database = createDatabase(path);
  const db = getSqliteHandle(database.db);
  const vault = createVault(path);
  const connections = createIntegrationConnections(database.db, vault);
  const first = await connections.createConnection({
    type: 'proxmox',
    name: 'One',
    url: 'https://one.example',
    tokenId: 'user@pve!one',
    secret: 'secret-one',
  });
  const second = await connections.createConnection({
    type: 'proxmox',
    name: 'Two',
    url: 'https://two.example',
    tokenId: 'user@pve!two',
    secret: 'secret-two',
  });
  const identity = createProposalService(db).issue('integration-reader', ['integrations:read']);
  process.env.HOMORA_AGENT_TOKEN = identity.token;
  vi.mocked(getAuthorizedResponse).mockResolvedValue({
    status: 200,
    body: JSON.stringify({ data: [{ type: 'qemu', status: 'running', name: 'private-vm' }] }),
  });
  const server = createMcp(db, { connections });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(a), server.connect(b)]);
    const list = await client.callTool({ name: 'list_integrations', arguments: {} });
    expect(JSON.stringify(list)).toContain('One');
    expect(JSON.stringify(list)).toContain('Two');
    expect(JSON.stringify(list)).not.toContain('secret-one');
    expect(JSON.stringify(list)).not.toContain('user@pve!one');
    const result = await client.callTool({
      name: 'get_integration_status',
      arguments: { id: second.id },
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-vm');
    expect(getAuthorizedResponse).toHaveBeenCalledWith(
      'https://two.example/api2/json/cluster/resources',
      expect.anything(),
      expect.anything(),
    );
    expect(first.id).not.toBe(second.id);
  } finally {
    await client.close();
    await server.close();
    database.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    rmSync(dir, { recursive: true, force: true });
  }
});

it('returns public Kuma monitor details and a distinct limit error through MCP', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-kuma-'));
  const database = createDatabase(join(dir, 'db.sqlite'));
  const db = getSqliteHandle(database.db);
  const vault = createVault(join(dir, 'db.sqlite'));
  const connections = createIntegrationConnections(database.db, vault);
  const connection = await connections.createConnection({
    type: 'uptime-kuma',
    name: 'Kuma',
    url: 'https://kuma.example',
    slug: 'home',
  });
  const identity = createProposalService(db).issue('integration-reader', ['integrations:read']);
  process.env.HOMORA_AGENT_TOKEN = identity.token;
  let count = 1;
  vi.mocked(getAuthorizedResponse).mockImplementation(async (url) => ({
    status: 200,
    body: JSON.stringify(
      url.includes('/heartbeat/')
        ? { heartbeatList: { 1: [] } }
        : {
            publicGroupList: [
              {
                name: 'Home',
                monitorList: Array.from({ length: count }, (_, i) => ({
                  id: i + 1,
                  name: `Monitor ${i + 1}`,
                })),
              },
            ],
          },
    ),
  }));
  const server = createMcp(db, { connections });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(a), server.connect(b)]);
    const response = await client.callTool({
      name: 'get_integration_status',
      arguments: { id: connection.id },
    });
    expect(response.isError).not.toBe(true);
    expect(JSON.stringify(response)).toContain('Monitor 1');
    expect(JSON.stringify(response)).toContain('unknown');
    count = 51;
    await connections.connectionData(connection.id, true).catch(() => {});
    const error = await client.callTool({
      name: 'get_integration_status',
      arguments: { id: connection.id },
    });
    expect(error.isError).toBe(true);
    expect(JSON.stringify(error)).toContain('integration-rows-limit');
  } finally {
    await client.close();
    await server.close();
    database.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    rmSync(dir, { recursive: true, force: true });
  }
});
