import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createTestSession } from './test-auth.js';
import { createVault } from './vault.js';
import { createApp } from './app.js';
import { createMcp } from './mcp.js';
import { createProposalService } from './proposals.js';
import { createServiceConfiguration } from './service-configuration.js';

it('records, validates and removes manual dependencies, with authorization and audit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-deps-'));
  const path = join(dir, 'db.sqlite');
  const db = createDatabase(path);
  const { auth, cookie } = await createTestSession();
  const headers = { origin: 'http://localhost:5173', cookie };
  const app = createApp(db.db, 5173, auth, createVault(path));
  const send = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    payload?: object,
    extra: Record<string, string> = headers,
  ) => app.inject({ method, url, headers: extra, payload });
  try {
    const make = async (name: string) =>
      (
        await send('POST', '/api/services', { name, url: 'https://x.test', category: 'Home' })
      ).json().id as number;
    const dns = await make('Pi-hole');
    const media = await make('Jellyfin');
    const proxy = await make('Proxy');

    // Authorization: no session, or a write without an allowed origin.
    expect((await app.inject({ method: 'GET', url: '/api/service-dependencies' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/services/${media}/dependencies`,
          headers: { cookie },
          payload: { dependsOnId: dns },
        })
      ).statusCode,
    ).toBe(403);

    const add = (id: number, dependsOnId: number) =>
      send('POST', `/api/services/${id}/dependencies`, { dependsOnId });
    expect((await add(media, dns)).statusCode).toBe(201);
    expect((await add(media, dns)).statusCode).toBe(200); // idempotent
    expect((await add(proxy, media)).statusCode).toBe(201);
    expect((await send('GET', '/api/service-dependencies')).json()).toEqual([
      { serviceId: media, dependsOnId: dns },
      { serviceId: proxy, dependsOnId: media },
    ]);

    // Validation: self, missing, cycle (direct and transitive), bad body.
    expect((await add(dns, dns)).json().code).toBe('dependency-self');
    expect((await add(media, 999)).statusCode).toBe(404);
    expect((await add(999, dns)).statusCode).toBe(404);
    expect((await add(dns, media)).statusCode).toBe(409);
    expect((await add(dns, proxy)).json().code).toBe('dependency-cycle');
    expect(
      (await send('POST', `/api/services/${dns}/dependencies`, { dependsOnId: 'x' })).statusCode,
    ).toBe(400);
    expect(
      (await send('POST', `/api/services/${dns}/dependencies`, { dependsOnId: 1, extra: 1 }))
        .statusCode,
    ).toBe(400);

    // Removing a card removes its edges.
    expect((await send('DELETE', `/api/services/${proxy}/dependencies/${media}`)).statusCode).toBe(
      200,
    );
    expect((await send('DELETE', `/api/services/${proxy}/dependencies/${media}`)).statusCode).toBe(
      404,
    );
    await send('DELETE', `/api/services/${dns}`);
    expect((await send('GET', '/api/service-dependencies')).json()).toEqual([]);

    const events = (await send('GET', '/api/activity')).json() as
      { action?: string }[] | { events?: { action: string }[] };
    const text = JSON.stringify(events);
    expect(text).toContain('service-dependency-add');
    expect(text).toContain('service-dependency-remove');
  } finally {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('lets a scoped agent read dependencies but not a token without services:read', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-deps-mcp-'));
  const db = createDatabase(join(dir, 'db.sqlite'));
  const sqlite = getSqliteHandle(db.db);
  const configuration = createServiceConfiguration(sqlite);
  const a = configuration.createService({ name: 'A', url: 'https://a.test', category: 'Home' });
  const b = configuration.createService({ name: 'B', url: 'https://b.test', category: 'Home' });
  sqlite
    .prepare('INSERT INTO service_dependencies(service_id,depends_on_id,created_at) VALUES(?,?,1)')
    .run(a.id, b.id);
  const proposals = createProposalService(sqlite, configuration);
  const connect = async (scopes: string[]) => {
    const identity = proposals.issue('agent-' + scopes.join('-'), scopes as never);
    const server = createMcp(sqlite, { token: identity.token });
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [x, y] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(y), client.connect(x)]);
    return client;
  };
  try {
    const reader = await connect(['services:read']);
    const read = await reader.callTool({ name: 'list_service_dependencies', arguments: {} });
    expect(JSON.parse((read.content as { text: string }[])[0].text)).toEqual([
      { serviceId: a.id, dependsOnId: b.id, serviceName: 'A', dependsOnName: 'B' },
    ]);
    const other = await connect(['audit:read']);
    expect(
      (await other.callTool({ name: 'list_service_dependencies', arguments: {} })).isError,
    ).toBe(true);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
