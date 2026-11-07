import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, it } from 'vitest';
import { createMcp } from './mcp.js';
import { createVault } from './vault.js';
it('expõe apenas ferramentas de leitura e lista serviços sem segredos', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-'));
  const db = new DatabaseSync(':memory:');
  db.exec(
    "CREATE TABLE services (id INTEGER PRIMARY KEY, name TEXT, url TEXT, category TEXT, description TEXT); INSERT INTO services VALUES (1,'Jellyfin','http://localhost/','Mídia','');",
  );
  const server = createMcp(db, createVault(join(dir, 'db')));
  const client = new Client({ name: 'test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(['list_services', 'list_proxmox_resources']);
    expect(tools.tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
    const result = await client.callTool({ name: 'list_services', arguments: {} });
    expect(JSON.stringify(result)).toContain('Jellyfin');
    const absent = await client.callTool({ name: 'list_proxmox_resources', arguments: {} });
    expect(absent.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
