import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { expect, it } from 'vitest';
import { createTestSession } from '../test-auth.js';
import { createVault } from '../vault.js';
import { createApp } from '../app.js';
import { createMcp } from './index.js';

it('reviews MCP group and widget proposals through authenticated HTTP across SQLite connections', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-flow-'));
  const path = join(dir, 'data.sqlite');
  const webDb = createDatabase(path);
  const mcpDb = createDatabase(path);
  const vault = createVault(path);
  const { auth, cookie } = await createTestSession();
  const headers = { cookie, origin: 'http://localhost:5173' };
  const app = createApp(webDb.db, 5173, auth, vault);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcp(getSqliteHandle(mcpDb.db));
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
    const batchResponse = await client.callTool({
      name: 'propose_batch',
      arguments: {
        items: [
          { kind: 'group', change: { op: 'create', name: 'Batch A' } },
          { kind: 'group', change: { op: 'create', name: 'Batch B' } },
        ],
      },
    });
    expect(batchResponse.isError).not.toBe(true);
    const batch = JSON.parse((batchResponse.content as { text: string }[])[0].text) as {
      batchId: string;
      proposals: { id: string; batchId: string }[];
    };
    expect(batch.proposals).toHaveLength(2);
    expect(batch.proposals.every((item) => item.batchId === batch.batchId)).toBe(true);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${batch.proposals[0].id}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposal-batches/${batch.batchId}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposal-batches/${batch.batchId}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(409);
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

it('reveals delegated tokens only to the authenticated reviewer and allows recovery', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-delegation-'));
  const path = join(dir, 'data.sqlite');
  const db = createDatabase(path);
  const vault = createVault(path);
  const { auth, cookie } = await createTestSession();
  const headers = { cookie, origin: 'http://localhost:5173' };
  const app = createApp(db.db, 5173, auth, vault);
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcp(getSqliteHandle(db.db));
  try {
    const parent = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers,
      payload: { name: 'parent', scopes: ['agents:propose', 'services:read'] },
    });
    process.env.HOMORA_AGENT_TOKEN = parent.json().token;
    await Promise.all([client.connect(a), server.connect(b)]);
    const denied = await client.callTool({
      name: 'propose_agent_create',
      arguments: { name: 'child', scopes: ['audit:read'] },
    });
    expect(denied.isError).toBe(true);
    const deniedBatch = await client.callTool({
      name: 'propose_batch',
      arguments: {
        items: [
          {
            kind: 'service',
            change: {
              op: 'create',
              service: { name: 'No', url: 'https://example.test', category: 'Home' },
            },
          },
        ],
      },
    });
    expect(deniedBatch.isError).toBe(true);
    const proposed = await client.callTool({
      name: 'propose_agent_create',
      arguments: { name: 'child', scopes: ['services:read'] },
    });
    expect(proposed.isError).not.toBe(true);
    const { id } = JSON.parse((proposed.content as { text: string }[])[0].text) as { id: string };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${id}/review`,
          headers: { origin: 'http://localhost:5173' },
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(401);
    const review = await app.inject({
      method: 'POST',
      url: `/api/proposals/${id}/review`,
      headers,
      payload: { approve: true },
    });
    expect(review.statusCode).toBe(200);
    expect(review.headers['cache-control']).toBe('no-store');
    const { token, agentId } = review.json() as { token: string; agentId: string };
    expect(token).toBeTruthy();
    expect(
      JSON.stringify(await client.callTool({ name: 'get_proposal', arguments: { id } })),
    ).not.toContain(token);
    expect(
      JSON.stringify(await client.callTool({ name: 'list_proposals', arguments: {} })),
    ).not.toContain(token);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${id}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(409);
    const replacement = await app.inject({
      method: 'POST',
      url: `/api/agents/${agentId}/rotate`,
      headers,
    });
    expect(replacement.statusCode).toBe(200);
    expect(replacement.json().token).not.toBe(token);
  } finally {
    await client.close();
    await server.close();
    await app.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
