import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createProposalService } from './proposals.js';
import { createVault } from './vault.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE services(id INTEGER PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,icon TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,allow_private INTEGER NOT NULL DEFAULT 0,check_type TEXT NOT NULL DEFAULT 'http',check_interval INTEGER,expected_status TEXT,check_path TEXT);
    CREATE TABLE service_groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,position INTEGER NOT NULL DEFAULT 0,columns INTEGER);
    CREATE TABLE integration_instances(id INTEGER PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,public_config TEXT NOT NULL,secret_ref TEXT,certificate_ref TEXT);
    CREATE TABLE integration_migrations(name TEXT PRIMARY KEY);
    CREATE TABLE integration_widgets(id INTEGER PRIMARY KEY,integration_id INTEGER NOT NULL REFERENCES integration_instances(id) ON DELETE RESTRICT,type TEXT NOT NULL,name TEXT NOT NULL,public_config TEXT NOT NULL,service_id INTEGER REFERENCES services(id) ON DELETE SET NULL);
    CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO config_version VALUES(1,1);
    CREATE TABLE agent_identities(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,scopes TEXT,revoked_at INTEGER,created_at INTEGER);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT,batch_id TEXT);
    CREATE TRIGGER service_proposal_immutable BEFORE UPDATE OF author_id,diff,base_hash,base_version,created_at ON service_proposals BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,proposal_id TEXT,result TEXT,created_at INTEGER,detail TEXT);
    INSERT INTO service_groups VALUES(1,'Media',0,NULL),(2,'Apps',1,NULL);
    INSERT INTO services(id,name,url,category,description,position) VALUES(1,'A','https://a.example','Media','',0),(2,'B','https://b.example','Media','',1),(3,'C','https://c.example','Apps','',0);
    INSERT INTO integration_instances VALUES(1,'jellyfin','Media','{"url":"https://media.example","allowPrivate":false}','encrypted-secret',NULL);
  `);
  const api = createProposalService(db);
  const agent = api.issue('agent', ['groups:propose', 'widgets:propose', 'connections:propose']);
  return { db, api, agent };
}

describe('managed proposals', () => {
  it.each([3, 4, 5])('renumbers groups after approving deletion of group %i', (id) => {
    const { db, api, agent } = fixture();
    try {
      db.exec(
        "INSERT INTO service_groups VALUES(3,'First',5,NULL),(4,'Middle',5,NULL),(5,'Last',9,NULL)",
      );
      const proposal = api.proposeManaged(agent.id, {
        kind: 'group',
        change: { op: 'delete', id },
      });
      expect(db.prepare('SELECT position FROM service_groups WHERE id=?').get(id)).toBeDefined();
      expect(api.decide(proposal.id, true, 'local-admin')).toBe('approved');
      const expected = [1, 2, 3, 4, 5].filter((groupId) => groupId !== id);
      expect(
        db.prepare('SELECT id,position FROM service_groups ORDER BY position,id').all(),
      ).toEqual(expected.map((groupId, position) => ({ id: groupId, position })));
      const create = api.proposeManaged(agent.id, {
        kind: 'group',
        change: { op: 'create', name: 'New' },
      });
      api.decide(create.id, true, 'local-admin');
      expect(db.prepare("SELECT position FROM service_groups WHERE name='New'").get()).toEqual({
        position: 4,
      });
      const names = (
        db.prepare('SELECT name FROM service_groups ORDER BY position').all() as { name: string }[]
      )
        .map((row) => row.name)
        .reverse();
      const reorder = api.proposeManaged(agent.id, {
        kind: 'group',
        change: { op: 'reorder', names },
      });
      api.decide(reorder.id, true, 'local-admin');
      expect(
        db.prepare('SELECT name,position FROM service_groups ORDER BY position').all(),
      ).toEqual(names.map((name, position) => ({ name, position })));
    } finally {
      db.close();
    }
  });
  it('validates group changes without applying them, and applies once with audit', () => {
    const { db, api, agent } = fixture();
    try {
      const p = api.proposeManaged(agent.id, {
        kind: 'group',
        change: { op: 'rename', id: 1, name: 'Movies' },
      });
      expect(db.prepare('SELECT name FROM service_groups WHERE id=1').get()).toEqual({
        name: 'Media',
      });
      expect(api.decide(p.id, true, 'local-admin')).toBe('approved');
      expect(db.prepare('SELECT category FROM services WHERE id=1').get()).toEqual({
        category: 'Movies',
      });
      expect(() => api.decide(p.id, true, 'local-admin')).toThrow();
      expect(
        db
          .prepare(
            "SELECT result FROM audit_events WHERE proposal_id=? AND action='review' ORDER BY id",
          )
          .all(p.id),
      ).toEqual([{ result: 'approved' }, { result: 'failed' }]);
      expect(() =>
        api.proposeManaged(agent.id, { kind: 'group', change: { op: 'delete', id: 1 } }),
      ).toThrow();
    } finally {
      db.close();
    }
  });
  it('rejects stale proposals when groups or widgets change outside configuration versioning', () => {
    const { db, api, agent } = fixture();
    try {
      const p = api.proposeManaged(agent.id, {
        kind: 'group',
        change: { op: 'create', name: 'Other' },
      });
      db.prepare('UPDATE service_groups SET columns=3 WHERE id=1').run();
      expect(() => api.decide(p.id, true, 'local-admin')).toThrow('Configuration has changed');
      expect(db.prepare("SELECT id FROM service_groups WHERE name='Other'").get()).toBeUndefined();
    } finally {
      db.close();
    }
  });
  it('moves and reorders cards only with a complete, exact list', () => {
    const { db, api, agent } = fixture();
    try {
      const change = {
        kind: 'card-order',
        change: { op: 'move', id: 1, targetCategory: 'Apps', sourceIds: [2], targetIds: [3, 1] },
      };
      expect(() =>
        api.proposeManaged(agent.id, {
          kind: 'card-order',
          change: { ...change.change, targetIds: [1, 1] },
        }),
      ).toThrow();
      const p = api.proposeManaged(agent.id, change);
      api.decide(p.id, true, 'local-admin');
      expect(
        db
          .prepare("SELECT id,position FROM services WHERE category='Apps' ORDER BY position")
          .all(),
      ).toEqual([
        { id: 3, position: 0 },
        { id: 1, position: 1 },
      ]);
    } finally {
      db.close();
    }
  });
  it('creates, links and removes widgets only on approval and never exposes connection secrets', () => {
    const { db, api, agent } = fixture();
    try {
      const p = api.proposeManaged(agent.id, {
        kind: 'widget',
        change: { op: 'create', integrationId: 1, name: 'Stats', serviceId: 1 },
      });
      expect(JSON.stringify(p)).not.toContain('encrypted-secret');
      expect(db.prepare('SELECT id FROM integration_widgets').all()).toHaveLength(0);
      api.decide(p.id, true, 'local-admin');
      const link = api.proposeManaged(agent.id, {
        kind: 'widget',
        change: { op: 'link', id: 1, serviceId: 2 },
      });
      api.decide(link.id, true, 'local-admin');
      expect(db.prepare('SELECT service_id FROM integration_widgets WHERE id=1').get()).toEqual({
        service_id: 2,
      });
      const remove = api.proposeManaged(agent.id, {
        kind: 'widget',
        change: { op: 'delete', id: 1 },
      });
      api.decide(remove.id, false, 'local-admin');
      expect(db.prepare('SELECT id FROM integration_widgets').all()).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('accepts only public connection setup fields and does not create a connection', () => {
    const { db, api, agent } = fixture();
    try {
      const change = { type: 'jellyfin', name: 'Media', url: 'https://media.example' };
      expect(() =>
        api.proposeManaged(agent.id, {
          kind: 'connection-setup',
          change: { ...change, secret: 'not-allowed' },
        }),
      ).toThrow();
      expect(() =>
        api.proposeManaged(agent.id, {
          kind: 'connection-setup',
          change: { ...change, url: 'https://user:pass@media.example/' },
        }),
      ).toThrow();
      const p = api.proposeManaged(agent.id, { kind: 'connection-setup', change });
      api.decide(p.id, true, 'local-admin');
      expect(db.prepare('SELECT id FROM integration_instances').all()).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it('creates the Proxmox bridge only on approval and rejects a changed vault', async () => {
    const { db, agent } = fixture();
    const dir = mkdtempSync(join(tmpdir(), 'homora-mcp-proxmox-'));
    const vault = createVault(join(dir, 'db'));
    const api = createProposalService(db, undefined, vault);
    try {
      const change = {
        kind: 'widget',
        change: { op: 'create', source: 'proxmox', name: 'Infra', serviceId: 1 },
      };
      expect(() => api.proposeManaged(agent.id, change)).toThrow();
      await vault.save({
        url: 'https://pve.example:8006',
        tokenId: 'reader@pve!token',
        secret: 'synthetic',
      });
      const stale = api.proposeManaged(agent.id, change);
      expect(
        db.prepare("SELECT id FROM integration_instances WHERE type='proxmox'").get(),
      ).toBeUndefined();
      await vault.save({
        url: 'https://pve2.example:8006',
        tokenId: 'reader@pve!token',
        secret: 'synthetic',
      });
      expect(() => api.decide(stale.id, true, 'local-admin')).toThrow('Configuration has changed');
      const next = api.proposeManaged(agent.id, change);
      api.decide(next.id, true, 'local-admin');
      expect(db.prepare("SELECT type FROM integration_widgets WHERE name='Infra'").get()).toEqual({
        type: 'proxmox',
      });
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
