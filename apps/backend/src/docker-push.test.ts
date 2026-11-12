import { describe, expect, it } from 'vitest';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createDockerPush } from './docker-push.js';

describe('Docker push sources', () => {
  it('stores only a token hash and rejects unauthorized, invalid and revoked updates', () => {
    const db = createDatabase(':memory:');
    try {
      const sqlite = getSqliteHandle(db.db);
      const push = createDockerPush(sqlite);
      const source = push.create('test');
      expect(source).not.toBeNull();
      if (!source) throw new Error('missing source');
      expect(JSON.stringify(push.list())).not.toContain(source.token);
      const valid = {
        containers: [
          {
            Id: 'a'.repeat(64),
            Names: ['/test'],
            Labels: { 'homora.url': 'https://example.test' },
          },
        ],
      };
      expect(push.ingest('f'.repeat(64), valid)).toBe('unauthorized');
      expect(
        push.ingest(source.token, { containers: [{ ...valid.containers[0], extra: 'secret' }] }),
      ).toBe('invalid');
      expect(push.ingest(source.token, valid)).toBe('ok');
      expect(push.list()[0]).toMatchObject({ inventoryVersion: 1 });
      expect(push.revoke(source.id)).toBe(true);
      expect(push.rotate(source.id)).toBeNull();
      expect(push.ingest(source.token, valid)).toBe('unauthorized');
      expect(push.list()[0]).toMatchObject({ inventoryVersion: 1 });
    } finally {
      db.close();
    }
  });
});

it('isolates sources and enforces snapshot review, authorization and revocation through HTTP', async () => {
  const { createTestAuth } = await import('./test-auth.js');
  const { createApp } = await import('./app.js');
  const db = createDatabase(':memory:');
  const { auth, cookie } = await createTestAuth(db.db);
  const app = createApp(db.db, 5173, auth);
  const headers = { origin: 'http://localhost:5173', cookie };
  const send = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers, payload });
  const push = (token: string, payload: object) =>
    app.inject({
      method: 'POST',
      url: '/docker-push/inventory',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  try {
    expect((await app.inject({ method: 'GET', url: '/api/discovery/sources' })).statusCode).toBe(
      401,
    );
    const a = (await send('POST', '/api/discovery/sources', { name: 'A' })).json();
    const b = (await send('POST', '/api/discovery/sources', { name: 'B' })).json();
    const container = (name: string) => ({
      containers: [
        {
          Id: 'a'.repeat(64),
          Names: ['/app'],
          Labels: { 'homora.url': `https://${name}.example.test`, 'homora.name': name },
        },
      ],
    });
    expect((await push(a.token, container('first'))).statusCode).toBe(204);
    expect((await push(b.token, container('second'))).statusCode).toBe(204);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/docker-push/inventory',
          headers: { authorization: `Bearer ${a.token}`, origin: 'http://localhost:5173' },
          payload: container('first'),
        })
      ).statusCode,
    ).toBe(403);
    const preview = (await send('GET', `/api/discovery/sources/${a.id}/suggestions`)).json();
    const before = await send('GET', '/api/services');
    expect(before.json()).toEqual([]);
    expect((await push(a.token, container('changed'))).statusCode).toBe(204);
    const payload = {
      ids: [preview.entries[0].id],
      inventoryVersion: preview.source.version,
      expectedVersion: preview.version,
    };
    expect((await send('POST', `/api/discovery/sources/${a.id}/import`, payload)).statusCode).toBe(
      409,
    );
    const current = (await send('GET', `/api/discovery/sources/${a.id}/suggestions`)).json();
    expect(
      (
        await send('POST', `/api/discovery/sources/${a.id}/import`, {
          ids: [current.entries[0].id],
          inventoryVersion: current.source.version,
          expectedVersion: current.version,
        })
      ).json().created,
    ).toBe(1);
    expect((await send('GET', '/api/services')).json()[0]).toMatchObject({
      name: 'changed',
      allowPrivate: false,
    });
    expect((await send('POST', `/api/discovery/sources/${a.id}/revoke`)).statusCode).toBe(204);
    expect((await push(a.token, container('first'))).statusCode).toBe(401);
    expect((await send('GET', `/api/discovery/sources/${b.id}/suggestions`)).statusCode).toBe(200);
    expect(JSON.stringify((await send('GET', '/api/discovery/sources')).json())).not.toContain(
      a.token,
    );
    const events = getSqliteHandle(db.db)
      .prepare(
        "SELECT actor,action,detail,ip_address FROM audit_events WHERE action LIKE 'docker-source-%' ORDER BY id",
      )
      .all();
    expect(events).toHaveLength(3);
    expect(events[2]).toMatchObject({
      action: 'docker-source-revoke',
      detail: a.id,
      ip_address: '127.0.0.1',
    });
    expect(JSON.stringify(events)).not.toContain(a.token);
    expect(events[0]).toMatchObject({ actor: expect.stringMatching(/^user:/) });
    expect((await send('POST', `/api/discovery/sources/${a.id}/rotate`)).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/docker-push/inventory',
          headers: { authorization: `Bearer ${b.token}`, 'content-type': 'text/plain' },
          payload: '{}',
        })
      ).statusCode,
    ).toBe(415);
    const tooLarge = await app.inject({
      method: 'POST',
      url: '/docker-push/inventory',
      headers: { authorization: `Bearer ${b.token}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ containers: [], padding: 'x'.repeat(1024 * 1024) }),
    });
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json().code).toBe('inventory-too-large');
    const rotated = await send('POST', `/api/discovery/sources/${b.id}/rotate`);
    expect(rotated.statusCode).toBe(200);
    expect((await push(b.token, container('second'))).statusCode).toBe(401);
    expect((await send('DELETE', `/api/discovery/sources/${b.id}`)).statusCode).toBe(204);
    const actions = getSqliteHandle(db.db)
      .prepare("SELECT action FROM audit_events WHERE action LIKE 'docker-source-%' ORDER BY id")
      .all();
    expect(actions.map((event) => event.action)).toEqual([
      'docker-source-create',
      'docker-source-create',
      'docker-source-revoke',
      'docker-source-rotate',
      'docker-source-remove',
    ]);
  } finally {
    await app.close();
    db.close();
  }
}, 15000);

it('supports scoped MCP reads and proposals without leaking URL query secrets', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
  const { createMcp } = await import('./mcp.js');
  const { createProposalService } = await import('./proposals.js');
  const dir = mkdtempSync(join(tmpdir(), 'homora-push-mcp-'));
  const db = createDatabase(':memory:');
  const sqlite = getSqliteHandle(db.db);
  const push = createDockerPush(sqlite);
  const source = push.create('Remote');
  if (!source) throw new Error('missing source');
  push.ingest(source.token, {
    containers: [
      {
        Id: 'a'.repeat(64),
        Names: ['/test'],
        Labels: { 'homora.url': 'https://example.test/?token=synthetic-secret' },
      },
    ],
  });
  const identity = createProposalService(sqlite).issue('agent', [
    'discovery:read',
    'proposals:create',
  ]);
  const server = createMcp(sqlite, { token: identity.token });
  const client = new Client({ name: 'test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(st), client.connect(ct)]);
    const capabilities = await client.callTool({ name: 'get_homora_capabilities', arguments: {} });
    const capabilityText = (capabilities.content as { text: string }[])[0].text;
    expect(JSON.parse(capabilityText)).toMatchObject({
      discoveryEnabled: true,
      discovery: { enabled: true, sources: 1 },
    });
    const listed = await client.callTool({ name: 'list_docker_push_sources', arguments: {} });
    expect(JSON.stringify(listed)).toContain('Remote');
    expect(JSON.stringify(listed)).not.toContain(source.token);
    const suggestions = await client.callTool({
      name: 'list_docker_push_suggestions',
      arguments: { sourceId: source.id },
    });
    expect(JSON.stringify(suggestions)).not.toContain('synthetic-secret');
    expect(JSON.stringify(suggestions)).toContain('example.test');
    const proposal = await client.callTool({
      name: 'propose_docker_push_card',
      arguments: { sourceId: source.id, id: 'a'.repeat(12), inventoryVersion: 1 },
    });
    expect(proposal.isError).not.toBe(true);
    expect(JSON.stringify(proposal)).not.toContain('synthetic-secret');
    const proposalId = JSON.parse((proposal.content as { text: string }[])[0].text).id;
    expect(push.revoke(source.id)).toBe(true);
    expect(createProposalService(sqlite).decide(proposalId, true, 'user:reviewer')).toBe(
      'approved',
    );
    const stale = await client.callTool({
      name: 'propose_docker_push_card',
      arguments: { sourceId: source.id, id: 'a'.repeat(12), inventoryVersion: 2 },
    });
    expect(stale.isError).toBe(true);
  } finally {
    await client.close();
    await server.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('rejects an outdated or revoked snapshot inside the card transaction', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createServiceConfiguration } = await import('./service-configuration.js');
  const { parseDocker } = await import('./docker-discovery.js');
  const dir = mkdtempSync(join(tmpdir(), 'homora-push-race-'));
  const first = createDatabase(join(dir, 'db.sqlite'));
  const second = createDatabase(join(dir, 'db.sqlite'));
  try {
    const one = createDockerPush(getSqliteHandle(first.db));
    const two = createDockerPush(getSqliteHandle(second.db));
    const identity = one.create('host');
    if (!identity) throw new Error();
    const payload = (name: string) => ({
      containers: [
        {
          Id: 'b'.repeat(64),
          Names: ['/app'],
          Labels: { 'homora.url': `https://${name}.example.test` },
        },
      ],
    });
    one.ingest(identity.token, payload('before'));
    const snapshot = one.snapshot(identity.id);
    if (!snapshot) throw new Error();
    const configuration = createServiceConfiguration(getSqliteHandle(first.db));
    const parsed = parseDocker(snapshot.containers).parsed;
    const version = configuration.previewImport(parsed).version;
    two.ingest(identity.token, payload('after'));
    expect(
      configuration.applyImport(parsed, {
        keepPrivate: false,
        expectedVersion: version,
        guard: () => one.isCurrent(identity.id, snapshot.version),
      }),
    ).toEqual({ status: 'stale' });
    expect(configuration.exportData().services).toHaveLength(0);
    const locked = one.snapshot(identity.id);
    if (!locked) throw new Error();
    const lockResult = configuration.applyImport(parseDocker(locked.containers).parsed, {
      keepPrivate: false,
      expectedVersion: version,
      guard: () => {
        expect(() => two.ingest(identity.token, payload('during'))).toThrow();
        return one.isCurrent(identity.id, locked.version);
      },
    });
    expect(lockResult.status).toBe('applied');
    expect(configuration.exportData().services[0].url).toBe('https://after.example.test/');
    const fresh = one.snapshot(identity.id);
    if (!fresh) throw new Error();
    two.revoke(identity.id);
    expect(
      configuration.applyImport(parseDocker(fresh.containers).parsed, {
        keepPrivate: false,
        expectedVersion: configuration.previewImport(parseDocker(fresh.containers).parsed).version,
        guard: () => one.isCurrent(identity.id, fresh.version),
      }),
    ).toEqual({ status: 'stale' });
    expect(configuration.exportData().services).toHaveLength(1);
  } finally {
    first.close();
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('enforces the source cap, freshness, unchanged inventory and token rotation', () => {
  const db = createDatabase(':memory:');
  try {
    const sqlite = getSqliteHandle(db.db);
    const push = createDockerPush(sqlite);
    const source = push.create('first');
    if (!source) throw new Error();
    const data = {
      containers: [
        { Id: 'd'.repeat(64), Names: ['/app'], Labels: { 'homora.url': 'https://example.test' } },
      ],
    };
    expect(push.ingest(source.token, data)).toBe('ok');
    expect(push.ingest(source.token, data)).toBe('ok');
    expect(push.snapshot(source.id)?.version).toBe(1);
    expect(push.ingest(source.token, { containers: Array(1001).fill(data.containers[0]) })).toBe(
      'invalid',
    );
    expect(
      push.ingest(source.token, { containers: [data.containers[0], data.containers[0]] }),
    ).toBe('invalid');
    sqlite
      .prepare('UPDATE docker_push_sources SET received_at=? WHERE id=?')
      .run(Date.now() - 301000, source.id);
    expect(push.snapshot(source.id)).toBeNull();
    expect(push.list()[0].stale).toBe(true);
    const replacement = push.rotate(source.id);
    if (!replacement) throw new Error();
    expect(push.ingest(source.token, data)).toBe('unauthorized');
    expect(push.ingest(replacement, data)).toBe('ok');
    for (let i = 0; i < 9; i++) expect(push.create(`source${i}`)).not.toBeNull();
    expect(push.create('eleventh')).toBeNull();
    expect(push.remove(source.id)).toBe(true);
    expect(push.create('replacement')).not.toBeNull();
  } finally {
    db.close();
  }
});

it('does not change the inventory version when Docker reorders containers', () => {
  const db = createDatabase(':memory:');
  try {
    const push = createDockerPush(getSqliteHandle(db.db));
    const source = push.create('source');
    if (!source) throw new Error('missing source');
    const containers = ['a', 'b'].map((id) => ({
      Id: id.repeat(64),
      Names: ['/app'],
      Labels: { 'homora.url': `https://${id}.example.test` },
    }));
    expect(push.ingest(source.token, { containers })).toBe('ok');
    expect(push.ingest(source.token, { containers: [...containers].reverse() })).toBe('ok');
    expect(push.snapshot(source.id)?.version).toBe(1);
  } finally {
    db.close();
  }
});

it('rolls back lifecycle changes if their audit record cannot be stored', () => {
  const db = createDatabase(':memory:');
  try {
    const sqlite = getSqliteHandle(db.db);
    const push = createDockerPush(sqlite);
    const actor = { id: 'user:synthetic', ipAddress: '127.0.0.1' };
    const source = push.create('source', actor);
    if (!source) throw new Error('missing source');
    sqlite.exec(
      "CREATE TRIGGER fail_push_audit BEFORE INSERT ON audit_events WHEN NEW.action LIKE 'docker-source-%' BEGIN SELECT RAISE(ABORT, 'audit failure'); END;",
    );
    expect(() => push.rotate(source.id, actor)).toThrow();
    expect(() => push.revoke(source.id, actor)).toThrow();
    expect(() => push.remove(source.id, actor)).toThrow();
    expect(() => push.create('other', actor)).toThrow();
    expect(push.list()).toHaveLength(1);
    expect(push.ingest(source.token, { containers: [] })).toBe('ok');
  } finally {
    db.close();
  }
});

it('returns a distinct source limit error and audits only successful operations', async () => {
  const { createTestAuth } = await import('./test-auth.js');
  const { createApp } = await import('./app.js');
  const db = createDatabase(':memory:');
  const { auth, cookie } = await createTestAuth(db.db);
  const app = createApp(db.db, 5173, auth);
  const push = createDockerPush(getSqliteHandle(db.db));
  try {
    for (let i = 0; i < 10; i++) expect(push.create(`source-${i}`)).not.toBeNull();
    const response = await app.inject({
      method: 'POST',
      url: '/api/discovery/sources',
      headers: { origin: 'http://localhost:5173', cookie },
      payload: { name: 'extra' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('source-limit');
    expect(
      getSqliteHandle(db.db)
        .prepare("SELECT * FROM audit_events WHERE action='docker-source-create'")
        .all(),
    ).toEqual([]);
  } finally {
    await app.close();
    db.close();
  }
}, 15000);
