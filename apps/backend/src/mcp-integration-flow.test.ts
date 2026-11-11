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
  const server = createMcp(db, vault, { connections });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([client.connect(a), server.connect(b)]);
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
    vi.mocked(getAuthorizedResponse).mockClear();
    const proxmox = await client.callTool({ name: 'get_integration_status', arguments: { id: 2 } });
    expect(proxmox.isError).toBe(true);
    expect(getAuthorizedResponse).not.toHaveBeenCalled();
    createProposalService(db).revoke(identity.id);
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
