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
    CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT);
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
    CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT);
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
