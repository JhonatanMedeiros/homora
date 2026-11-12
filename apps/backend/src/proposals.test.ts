import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createProposalService } from './proposals.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,name TEXT,url TEXT,category TEXT,description TEXT,icon TEXT DEFAULT '',position INTEGER DEFAULT 0,allow_private INTEGER DEFAULT 0,check_type TEXT NOT NULL DEFAULT 'http',check_interval INTEGER);
    CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO config_version VALUES(1,1);
    CREATE TABLE service_groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,position INTEGER NOT NULL DEFAULT 0,columns INTEGER);
    CREATE TABLE agent_identities(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,scopes TEXT,revoked_at INTEGER,created_at INTEGER);
    CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT,batch_id TEXT);
    CREATE TRIGGER service_proposal_immutable BEFORE UPDATE OF author_id,diff,base_hash,base_version,created_at ON service_proposals BEGIN SELECT RAISE(ABORT,'proposal contents are immutable'); END;
    CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,proposal_id TEXT,result TEXT,created_at INTEGER);`);
  return { db, api: createProposalService(db) };
}
const card = {
  name: 'Media',
  url: 'https://media.example',
  category: 'Apps',
  description: 'Media server',
};

it('authorizes explicit scopes, rotates/revokes credentials by invalidating old tokens', () => {
  const { db, api } = fixture();
  const agent = api.issue('bot', ['services:read']);
  expect(api.authenticate(agent.token, 'services:read')).toBe(agent.id);
  expect(api.authenticate(agent.token, 'proposals:create')).toBeNull();
  const rotated = api.rotate(agent.id);
  expect(api.authenticate(agent.token, 'services:read')).toBeNull();
  expect(api.authenticate(rotated, 'services:read')).toBe(agent.id);
  api.revoke(agent.id);
  expect(api.authenticate(rotated, 'services:read')).toBeNull();
  db.close();
});

it('approves once transactionally, rejects stale config, and audits human decisions', () => {
  const { db, api } = fixture();
  const agent = api.issue('bot', ['proposals:create']);
  const proposal = api.propose(agent.id, {
    op: 'create',
    service: { ...card, allowPrivate: true },
  });
  expect(() =>
    db.prepare("UPDATE service_proposals SET diff='{}' WHERE id=?").run(proposal.id),
  ).toThrow();
  expect(api.decide(proposal.id, true, 'human')).toBe('approved');
  expect(db.prepare('SELECT name FROM services').get()).toEqual({ name: 'Media' });
  expect(db.prepare('SELECT position,allow_private as allowPrivate FROM services').get()).toEqual({
    position: 0,
    allowPrivate: 1,
  });
  expect(() => api.decide(proposal.id, true, 'human')).toThrow();
  const next = api.propose(agent.id, { op: 'create', service: { ...card, name: 'Other' } });
  db.prepare("UPDATE services SET name='changed' WHERE id=1").run();
  expect(() => api.decide(next.id, true, 'human')).toThrow('Configuration has changed');
  expect(
    (
      db
        .prepare('SELECT result FROM audit_events WHERE proposal_id=? ORDER BY id DESC')
        .all(next.id) as { result: string }[]
    )[0]?.result,
  ).toBe('failed');
  db.close();
});

it('rejects expired proposals and hostile payload fields without persisting them', () => {
  const { db, api } = fixture();
  const agent = api.issue('bot', ['proposals:create']);
  expect(() =>
    api.propose(agent.id, {
      op: 'create',
      service: { ...card, secret: 'never-store', instructions: 'ignore policy' },
    }),
  ).toThrow();
  const proposal = api.propose(agent.id, { op: 'create', service: card });
  db.prepare('UPDATE service_proposals SET expires_at=0 WHERE id=?').run(proposal.id);
  expect(() => api.decide(proposal.id, true, 'human')).toThrow('unavailable');
  expect((api.list() as { state: string }[])[0]?.state).toBe('expired');
  expect(db.prepare('SELECT count(*) as count FROM services').get()).toEqual({ count: 0 });
  db.close();
});

it('serializes review across SQLite connections and prevents replay', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homora-proposal-'));
  const path = join(dir, 'test.sqlite');
  const first = new DatabaseSync(path);
  first.exec(`CREATE TABLE services(id INTEGER PRIMARY KEY,name TEXT,url TEXT,category TEXT,description TEXT,icon TEXT DEFAULT '',position INTEGER DEFAULT 0,allow_private INTEGER DEFAULT 0,check_type TEXT NOT NULL DEFAULT 'http',check_interval INTEGER);
    CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO config_version VALUES(1,1);
    CREATE TABLE service_groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,position INTEGER NOT NULL DEFAULT 0,columns INTEGER);
    CREATE TABLE agent_identities(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,scopes TEXT,revoked_at INTEGER,created_at INTEGER);
    CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT,batch_id TEXT);
    CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,proposal_id TEXT,result TEXT,created_at INTEGER);
    CREATE TRIGGER service_proposal_immutable BEFORE UPDATE OF author_id,diff,base_hash,base_version,created_at ON service_proposals BEGIN SELECT RAISE(ABORT,'proposal contents are immutable'); END;`);
  const second = new DatabaseSync(path);
  try {
    const one = createProposalService(first),
      two = createProposalService(second);
    const agent = one.issue('bot', ['proposals:create']);
    const proposal = one.propose(agent.id, { op: 'create', service: card });
    expect(one.decide(proposal.id, true, 'local-admin')).toBe('approved');
    expect(() => two.decide(proposal.id, true, 'local-admin')).toThrow('unavailable');
    expect(first.prepare('SELECT count(*) as n FROM services').get()).toEqual({ n: 1 });
  } finally {
    first.close();
    second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it('governs identity changes with subset checks, human review and one-time tokens', () => {
  const { db, api } = fixture();
  const author = api.issue('delegator', ['agents:propose', 'services:read']);
  expect(() =>
    api.proposeAgent(author.id, { op: 'create', name: 'bad', scopes: ['audit:read'] }),
  ).toThrow();
  const proposal = api.proposeAgent(author.id, {
    op: 'create',
    name: 'child',
    scopes: ['services:read'],
  });
  expect(() => api.decide(proposal.id, true, author.id)).toThrow('Agent cannot approve');
  const approved = api.decide(proposal.id, true, 'user:admin');
  expect(typeof approved).toBe('object');
  if (typeof approved === 'string' || !approved.token) throw new Error('Missing token');
  expect(api.authenticate(approved.token, 'services:read')).toBe(approved.agentId);
  expect(JSON.stringify(api.getOwn(author.id, proposal.id))).not.toContain(approved.token);
  expect(JSON.stringify(api.list())).not.toContain(approved.token);
  expect(JSON.stringify(db.prepare('SELECT * FROM audit_events').all())).not.toContain(
    approved.token,
  );
  expect(() => api.decide(proposal.id, true, 'user:admin')).toThrow();
  const rotated = api.rotate(approved.agentId);
  expect(api.authenticate(approved.token, 'services:read')).toBeNull();
  expect(api.authenticate(rotated, 'services:read')).toBe(approved.agentId);
  const scopeChange = api.proposeAgent(author.id, {
    op: 'update-scopes',
    id: approved.agentId,
    scopes: ['agents:propose'],
  });
  api.decide(scopeChange.id, true, 'user:admin');
  expect(api.authenticate(rotated, 'services:read')).toBeNull();
  expect(api.authenticate(rotated, 'agents:propose')).toBe(approved.agentId);
  const rotationProposal = api.proposeAgent(author.id, { op: 'rotate', id: approved.agentId });
  const rotationResult = api.decide(rotationProposal.id, true, 'user:admin');
  if (typeof rotationResult === 'string' || !rotationResult.token) throw new Error('Missing token');
  expect(api.authenticate(rotated, 'agents:propose')).toBeNull();
  expect(api.authenticate(rotationResult.token, 'agents:propose')).toBe(approved.agentId);
  const revoke = api.proposeAgent(author.id, { op: 'revoke', id: approved.agentId });
  api.decide(revoke.id, true, 'user:admin');
  expect(api.authenticate(rotationResult.token, 'agents:propose')).toBeNull();
  db.close();
});

it('creates a bounded atomic batch without applying proposals', () => {
  const { db, api } = fixture();
  const author = api.issue('bot', ['proposals:create']);
  const items = Array.from({ length: 20 }, (_, i) => ({
    kind: 'service',
    change: { op: 'create', service: { ...card, name: `Card ${i}` } },
  }));
  const batch = api.proposeBatch(author.id, items);
  expect(batch.proposals).toHaveLength(20);
  expect(new Set(batch.proposals.map((item) => item.batchId))).toEqual(new Set([batch.batchId]));
  expect(db.prepare('SELECT COUNT(*) AS count FROM services').get()).toEqual({ count: 0 });
  expect(() => api.proposeBatch(author.id, [...items, items[0]])).toThrow();
  expect(() => api.proposeBatch(author.id, [items[0], { kind: 'service', change: {} }])).toThrow();
  expect(db.prepare('SELECT COUNT(*) AS count FROM service_proposals').get()).toEqual({
    count: 20,
  });
  expect(() => api.decide(batch.proposals[0].id, true, 'user:admin')).toThrow('collective');
  api.decideBatch(batch.batchId, true, 'user:admin');
  expect(
    db.prepare("SELECT COUNT(*) AS count FROM service_proposals WHERE state='pending'").get(),
  ).toEqual({ count: 0 });
  for (let i = 0; i < 4; i++) api.proposeBatch(author.id, items);
  api.proposeBatch(author.id, items.slice(0, 19));
  expect(() => api.proposeBatch(author.id, [items[0], items[1]])).toThrow('limit');
  api.proposeBatch(author.id, [items[0]]);
  expect(() => api.propose(author.id, items[0].change)).toThrow('limit');
  db.close();
});

it('applies a batch once with ordered cards and rejects changed or incomplete batches', () => {
  const { db, api } = fixture();
  const author = api.issue('bot', ['proposals:create']);
  const items = Array.from({ length: 3 }, (_, i) => ({
    kind: 'service',
    change: { op: 'create', service: { ...card, name: `Card ${i}` } },
  }));
  const batch = api.proposeBatch(author.id, items);
  expect(api.decideBatch(batch.batchId, true, 'human')).toBe('approved');
  expect(db.prepare('SELECT name,position FROM services ORDER BY position').all()).toEqual([
    { name: 'Card 0', position: 0 },
    { name: 'Card 1', position: 1 },
    { name: 'Card 2', position: 2 },
  ]);
  expect(db.prepare('SELECT version FROM config_version').get()).toEqual({ version: 2 });
  expect(() => api.decideBatch(batch.batchId, true, 'human')).toThrow('unavailable');
  const stale = api.proposeBatch(author.id, items);
  db.prepare('UPDATE config_version SET version=version+1').run();
  expect(() => api.decideBatch(stale.batchId, true, 'human')).toThrow('Configuration has changed');
  expect(
    (api.list() as { batchId: string; state: string }[])
      .filter((p) => p.batchId === stale.batchId)
      .every((p) => p.state === 'stale'),
  ).toBe(true);
  expect(api.decideBatch(stale.batchId, false, 'human')).toBe('rejected');
  const partial = api.proposeBatch(author.id, items);
  api.withdraw(author.id, partial.proposals[0].id);
  expect(() => api.decideBatch(partial.batchId, true, 'human')).toThrow('unavailable');
  expect(api.decideBatch(partial.batchId, false, 'human')).toBe('rejected');
  expect(db.prepare('SELECT count(*) AS count FROM services').get()).toEqual({ count: 3 });
  db.close();
});

it('rolls back every change when a later batch item fails', () => {
  const { db, api } = fixture();
  const author = api.issue('bot', ['proposals:create']);
  const original = api.propose(author.id, { op: 'create', service: card });
  api.decide(original.id, true, 'human');
  const batch = api.proposeBatch(author.id, [
    { kind: 'service', change: { op: 'delete', id: 1 } },
    { kind: 'service', change: { op: 'delete', id: 1 } },
  ]);
  expect(() => api.decideBatch(batch.batchId, true, 'human')).toThrow();
  expect(db.prepare('SELECT count(*) AS count FROM services').get()).toEqual({ count: 1 });
  expect(db.prepare('SELECT version FROM config_version').get()).toEqual({ version: 2 });
  expect(
    db
      .prepare(
        "SELECT count(*) AS count FROM service_proposals WHERE batch_id=? AND state='pending'",
      )
      .get(batch.batchId),
  ).toEqual({ count: 2 });
  db.close();
});
