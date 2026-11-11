import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { createMcp } from './mcp.js';
import { createVault } from './vault.js';
import { createProposalService } from './proposals.js';
it('validates proposal inputs and lists services without secrets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-'));
  const db = new DatabaseSync(':memory:');
  db.exec(
    "CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT, url TEXT, category TEXT, description TEXT, icon TEXT DEFAULT '', position INTEGER DEFAULT 0, allow_private INTEGER DEFAULT 0,check_type TEXT NOT NULL DEFAULT 'http',check_interval INTEGER); INSERT INTO services(id,name,url,category,description) VALUES (1,'Jellyfin','http://localhost/','Media',''); CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER); CREATE TABLE agent_identities(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,scopes TEXT,revoked_at INTEGER,created_at INTEGER); CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT); CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,proposal_id TEXT,result TEXT,created_at INTEGER);",
  );
  const identity = createProposalService(db).issue('test', ['services:read', 'proposals:create']);
  process.env.HOMORA_AGENT_TOKEN = identity.token;
  const server = createMcp(db, createVault(join(dir, 'db')));
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual([
      'list_services',
      'propose_service_card',
      'list_proxmox_resources',
    ]);
    const result = await client.callTool({ name: 'list_services', arguments: {} });
    expect(JSON.stringify(result)).toContain('Jellyfin');
    const invalid = await client.callTool({
      name: 'propose_service_card',
      arguments: { op: 'create', service: { name: 'x' } },
    });
    expect(invalid.isError).toBe(true);
    const unknownField = await client.callTool({
      name: 'propose_service_card',
      arguments: {
        op: 'create',
        service: { name: 'Home', url: 'http://localhost:8000', category: 'Homelab', admin: true },
      },
    });
    expect(unknownField.isError).toBe(true);
    const proposal = await client.callTool({
      name: 'propose_service_card',
      arguments: {
        op: 'create',
        service: { name: 'Home', url: 'http://localhost:8000', category: 'Homelab' },
      },
    });
    expect(proposal.isError, JSON.stringify(proposal)).not.toBe(true);
    const absent = await client.callTool({ name: 'list_proxmox_resources', arguments: {} });
    expect(absent.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
    db.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    rmSync(dir, { recursive: true, force: true });
  }
});
