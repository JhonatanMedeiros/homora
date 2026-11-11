import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { createMcp } from './mcp.js';

it('reviews MCP group and widget proposals through authenticated HTTP across SQLite connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-flow-'));
  const path = join(dir, 'data.sqlite');
  const webDb = createDatabase(path);
  const mcpDb = createDatabase(path);
  const auth = createAuth(`${path}.auth`);
  const vault = createVault(path);
  auth.setup('synthetic-password');
  const cookie = `homora_session=${auth.login('synthetic-password', 'test')}`;
  const headers = { cookie, origin: 'http://localhost:5173' };
  const app = createApp(webDb.db, 5173, auth, vault);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcp(getSqliteHandle(mcpDb.db), vault);
  try {
    const agent = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers,
      payload: {
        name: 'bot',
        scopes: ['services:read', 'groups:propose', 'widgets:read', 'widgets:propose'],
      },
    });
    expect(agent.statusCode).toBe(201);
    process.env.HOMORA_AGENT_TOKEN = agent.json().token;
    await Promise.all([client.connect(a), server.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError, JSON.stringify(response)).not.toBe(true);
      return JSON.parse((response.content as { text: string }[])[0].text) as { id: string };
    };
    const group = await call('propose_group_change', { op: 'create', name: 'Media' });
    expect((await app.inject({ method: 'GET', url: '/api/groups', headers })).json()).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${group.id}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/groups', headers })).json()).toMatchObject(
      [{ name: 'Media' }],
    );
    const card = await app.inject({
      method: 'POST',
      url: '/api/services',
      headers,
      payload: { name: 'Media', url: 'http://localhost:9999', category: 'Media' },
    });
    const connection = await app.inject({
      method: 'POST',
      url: '/api/connections',
      headers,
      payload: { type: 'jellyfin', name: 'Server', url: 'https://example.test' },
    });
    expect(connection.statusCode).toBe(201);
    const widget = await call('propose_widget_change', {
      op: 'create',
      integrationId: connection.json().id,
      name: 'Stats',
      serviceId: card.json().id,
    });
    expect((await app.inject({ method: 'GET', url: '/api/widgets', headers })).json()).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${widget.id}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/widgets', headers })).json(),
    ).toMatchObject([{ name: 'Stats', serviceId: card.json().id }]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${widget.id}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(409);
    const pending = await call('propose_group_change', { op: 'rename', id: 1, name: 'Changed' });
    await app.inject({
      method: 'PUT',
      url: '/api/groups/1/columns',
      headers,
      payload: { columns: 2 },
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${pending.id}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(409);
    expect((await app.inject({ method: 'GET', url: '/api/groups', headers })).json()).toMatchObject(
      [{ name: 'Media', columns: 2 }],
    );
  } finally {
    await client.close();
    await server.close();
    await app.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    mcpDb.close();
    webDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
