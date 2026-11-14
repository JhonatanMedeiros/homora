import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createProposalService } from './index.js';
import { CARD_SCHEMA } from '../test-card-schema.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    ${CARD_SCHEMA}
    CREATE TABLE pages(id INTEGER PRIMARY KEY,name TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0); INSERT INTO pages VALUES(1,'Home',0);
    CREATE TABLE service_groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,position INTEGER NOT NULL DEFAULT 0,columns INTEGER,page_id INTEGER);
    CREATE TABLE integration_instances(id INTEGER PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,public_config TEXT NOT NULL,secret_ref TEXT,certificate_ref TEXT);
    CREATE TABLE integration_widgets(id INTEGER PRIMARY KEY,integration_id INTEGER NOT NULL,type TEXT NOT NULL,name TEXT NOT NULL,public_config TEXT NOT NULL,service_id INTEGER);
    CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO config_version VALUES(1,1);
    CREATE TABLE agent_identities(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,scopes TEXT,revoked_at INTEGER,created_at INTEGER);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT,batch_id TEXT);
    CREATE TRIGGER service_proposal_immutable BEFORE UPDATE OF author_id,diff,base_hash,base_version,created_at ON service_proposals BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,proposal_id TEXT,result TEXT,created_at INTEGER,detail TEXT);
  `);
  const api = createProposalService(db);
  const agent = api.issue('bot', ['proposals:create', 'probes:propose']);
  return { db, api, agent };
}
const probe = (name: string, address: string) => ({
  kind: 'probe' as const,
  change: { op: 'create' as const, probe: { name, address, checkType: 'http' as const } },
});
const states = (api: ReturnType<typeof fixture>['api']) =>
  Object.fromEntries(
    (api.list() as unknown as { id: string; state: string }[]).map((p) => [p.id, p.state]),
  );

describe('deciding several proposals in a row', () => {
  it('keeps independent probe proposals approvable after one of them is applied', () => {
    const { db, api, agent } = fixture();
    const a = api.proposeManaged(agent.id, probe('Coolify', 'https://coolify.example/'));
    const b = api.proposeManaged(agent.id, probe('Tetto', 'https://tetto.example/'));
    const c = api.proposeManaged(agent.id, probe('PVE', 'https://pve.example/'));
    expect(api.decide(a.id, true, 'user:1')).toBe('approved');
    expect(states(api)).toMatchObject({ [b.id]: 'pending', [c.id]: 'pending' });
    expect(api.decide(b.id, true, 'user:1')).toBe('approved');
    expect(api.decide(c.id, true, 'user:1')).toBe('approved');
    expect(db.prepare('SELECT count(*) AS n FROM monitors').get()).toEqual({ n: 3 });
    db.close();
  });

  it('returns the pending proposal instead of queueing an identical one', () => {
    const { db, api, agent } = fixture();
    const first = api.proposeManaged(agent.id, probe('Coolify', 'https://coolify.example/'));
    const again = api.proposeManaged(agent.id, probe('Coolify', 'https://coolify.example/'));
    expect(again.id).toBe(first.id);
    const different = api.proposeManaged(agent.id, probe('Coolify', 'https://other.example/'));
    expect(different.id).not.toBe(first.id);
    const card = { name: 'Media', url: 'https://media.example', category: 'Apps', description: '' };
    const s1 = api.propose(agent.id, { op: 'create', service: card });
    expect(api.propose(agent.id, { op: 'create', service: card }).id).toBe(s1.id);
    expect(
      api.propose(agent.id, { op: 'create', service: { ...card, name: 'Other' } }).id,
    ).not.toBe(s1.id);
    expect(db.prepare('SELECT count(*) AS n FROM service_proposals').get()).toEqual({ n: 4 });
    db.close();
  });

  it('does not match a rejected or expired proposal', () => {
    const { db, api, agent } = fixture();
    const first = api.proposeManaged(agent.id, probe('Coolify', 'https://coolify.example/'));
    api.decide(first.id, false, 'user:1');
    expect(api.proposeManaged(agent.id, probe('Coolify', 'https://coolify.example/')).id).not.toBe(
      first.id,
    );
    db.close();
  });
});

describe('undoing a rejection', () => {
  it('puts the proposal back and records the undo', () => {
    const { db, api, agent } = fixture();
    const p = api.proposeManaged(agent.id, probe('Coolify', 'https://coolify.example/'));
    api.decide(p.id, false, 'user:1');
    expect(api.undoRejection(p.id, false, 'user:1')).toBe('pending');
    expect(states(api)[p.id]).toBe('pending');
    expect(api.decide(p.id, true, 'user:1')).toBe('approved');
    expect(
      db.prepare("SELECT actor,result FROM audit_events WHERE action='review-undo'").all(),
    ).toEqual([{ actor: 'user:1', result: 'ok' }]);
    db.close();
  });

  it('refuses approved proposals, other reviewers and old rejections', () => {
    const { db, api, agent } = fixture();
    const approved = api.proposeManaged(agent.id, probe('A', 'https://a.example/'));
    api.decide(approved.id, true, 'user:1');
    expect(() => api.undoRejection(approved.id, false, 'user:1')).toThrow();
    const rejected = api.proposeManaged(agent.id, probe('B', 'https://b.example/'));
    api.decide(rejected.id, false, 'user:1');
    expect(() => api.undoRejection(rejected.id, false, 'user:2')).toThrow();
    db.prepare('UPDATE service_proposals SET reviewed_at=? WHERE id=?').run(
      Date.now() - 120_000,
      rejected.id,
    );
    expect(() => api.undoRejection(rejected.id, false, 'user:1')).toThrow();
    db.close();
  });
});
