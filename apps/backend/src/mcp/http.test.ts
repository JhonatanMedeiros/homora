import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createDatabase } from '@homora/db';
import { expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestSession } from '../test-auth.js';
import { createVault } from '../vault.js';

it('authenticates each HTTP request, enforces scopes and revocation, and rejects hostile hosts and origins', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-http-'));
  const path = join(dir, 'data.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const bound = probe.address();
  if (!bound || typeof bound === 'string') throw new Error('missing port');
  const port = bound.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const app = createApp(db.db, 5173, auth, createVault(path), [], undefined, { apiPort: port });
  const headers = { cookie, origin: 'http://localhost:5173' };
  const agent = await app.inject({
    method: 'POST',
    url: '/api/agents',
    headers,
    payload: { name: 'reader', scopes: ['services:read'] },
  });
  const token = agent.json().token as string;
  const client = new Client({ name: 'test', version: '1' });
  try {
    await app.listen({ port, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const request = (authorization?: string, host = `127.0.0.1:${port}`, origin?: string) =>
      fetch(url, {
        method: 'POST',
        headers: {
          host,
          ...(authorization ? { authorization } : {}),
          ...(origin ? { origin } : {}),
          'content-type': 'application/json',
        },
        body: '{}',
      });
    expect((await request()).status).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/mcp',
          headers: { host: 'evil.test', authorization: `Bearer ${token}` },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await request(`Bearer ${token}`, `127.0.0.1:${port}`, 'https://evil.test')).status,
    ).toBe(403);
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: `Bearer ${token}`, host: `127.0.0.1:${port}` } },
    });
    await client.connect(transport);
    expect((await client.callTool({ name: 'list_services' })).isError).not.toBe(true);
    expect(
      (
        await client.callTool({
          name: 'propose_group_change',
          arguments: { op: 'create', name: 'Test' },
        })
      ).isError,
    ).toBe(true);
    await app.inject({ method: 'POST', url: `/api/agents/${agent.json().id}/revoke`, headers });
    expect((await request(`Bearer ${token}`)).status).toBe(401);
  } finally {
    await client.close();
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('exposes remote push discovery over HTTP only to authorized MCP scopes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-push-http-'));
  const path = join(dir, 'data.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const app = createApp(db.db, 5173, auth, createVault(path), [], undefined, { apiPort: port });
  const headers = { cookie, origin: 'http://localhost:5173' };
  const source = (
    await app.inject({
      method: 'POST',
      url: '/api/discovery/sources',
      headers,
      payload: { name: 'Remote' },
    })
  ).json();
  await app.inject({
    method: 'POST',
    url: '/docker-push/inventory',
    headers: { authorization: `Bearer ${source.token}` },
    payload: {
      containers: [
        {
          Id: 'c'.repeat(64),
          Names: ['/app'],
          Labels: { 'homora.url': 'https://example.test/?key=hidden' },
        },
      ],
    },
  });
  const identity = (
    await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers,
      payload: { name: 'reader', scopes: ['discovery:read'] },
    })
  ).json();
  const client = new Client({ name: 'test', version: '1' });
  try {
    await app.listen({ port, host: '127.0.0.1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${identity.token}` } },
      }),
    );
    const suggestions = await client.callTool({
      name: 'list_docker_push_suggestions',
      arguments: { sourceId: source.id },
    });
    expect(suggestions.isError).not.toBe(true);
    expect(JSON.stringify(suggestions)).toContain('example.test');
    expect(JSON.stringify(suggestions)).not.toContain('hidden');
    expect(
      (
        await client.callTool({
          name: 'propose_docker_push_card',
          arguments: { sourceId: source.id, id: 'c'.repeat(12), inventoryVersion: 1 },
        })
      ).isError,
    ).toBe(true);
  } finally {
    await client.close();
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
