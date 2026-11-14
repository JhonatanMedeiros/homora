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

it('publishes a card and a probe only after review, then hides them, with the UI audit event', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-public-'));
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
      payload: { name: 'bot', scopes: ['probes:propose', 'public-status:propose'] },
    });
    expect(agent.statusCode).toBe(201);
    process.env.HOMORA_AGENT_TOKEN = agent.json().token;
    await Promise.all([client.connect(a), server.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await client.callTool({ name, arguments: args });
      expect(response.isError, JSON.stringify(response)).not.toBe(true);
      return JSON.parse((response.content as { text: string }[])[0].text) as { id: string };
    };
    const review = async (id: string) =>
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposals/${id}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode;
    const publicNames = async () =>
      (
        (await app.inject({ method: 'GET', url: '/api/public/status' })).json() as {
          services?: { name: string }[];
        } | null
      )?.services?.map((service) => service.name) ?? [];

    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/public-status/admin',
          headers,
          payload: { enabled: true },
        })
      ).statusCode,
    ).toBe(200);
    const card = (
      await app.inject({
        method: 'POST',
        url: '/api/services',
        headers,
        payload: { name: 'Kuma', url: 'http://localhost:9999', category: 'Ops' },
      })
    ).json() as { id: number };
    const created = await call('propose_probe', {
      op: 'create',
      probe: { name: 'WAN', address: 'https://wan.example.com' },
    });
    expect(await review(created.id)).toBe(200);
    const probe = (
      getSqliteHandle(webDb.db).prepare("SELECT id FROM monitors WHERE name='WAN'").get() as {
        id: number;
      }
    ).id;

    // Created through the normal paths, both are private.
    expect(await publicNames()).toEqual([]);
    const pending = await call('propose_public_visibility', { serviceId: card.id, isPublic: true });
    expect(await publicNames()).toEqual([]);
    expect(await review(pending.id)).toBe(200);
    expect(await publicNames()).toEqual(['Kuma']);
    const second = await call('propose_public_visibility', { serviceId: probe, isPublic: true });
    expect(await review(second.id)).toBe(200);
    expect((await publicNames()).sort()).toEqual(['Kuma', 'WAN']);

    const audit = getSqliteHandle(webDb.db)
      .prepare("SELECT detail FROM audit_events WHERE action='service-public' ORDER BY id")
      .all();
    expect(audit).toEqual([{ detail: `${card.id}:public` }, { detail: `${probe}:public` }]);

    const hide = await call('propose_public_visibility', { serviceId: card.id, isPublic: false });
    expect(await review(hide.id)).toBe(200);
    expect(await publicNames()).toEqual(['WAN']);

    // A batch is reviewed as one decision and still publishes through the same audited path.
    const batch = await client.callTool({
      name: 'propose_batch',
      arguments: {
        items: [
          { kind: 'public-visibility', change: { serviceId: card.id, isPublic: true } },
          { kind: 'public-visibility', change: { serviceId: probe, isPublic: false } },
        ],
      },
    });
    expect(batch.isError, JSON.stringify(batch)).not.toBe(true);
    const { batchId } = JSON.parse((batch.content as { text: string }[])[0].text) as {
      batchId: string;
    };
    expect(await publicNames()).toEqual(['WAN']);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/proposal-batches/${batchId}/review`,
          headers,
          payload: { approve: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(await publicNames()).toEqual(['Kuma']);

    const unknown = await client.callTool({
      name: 'propose_public_visibility',
      arguments: { serviceId: 9999, isPublic: true },
    });
    expect(unknown.isError).toBe(true);
    const flat = await client.callTool({
      name: 'propose_probe',
      arguments: {
        op: 'create',
        probe: { name: 'X', address: 'https://x.example.com', isPublic: true },
      },
    });
    expect(flat.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
    await app.close();
    delete process.env.HOMORA_AGENT_TOKEN;
    webDb.close();
    mcpDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
