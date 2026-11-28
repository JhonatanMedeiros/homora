import { MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createProposalService } from './index.js';
import { CARD_SCHEMA } from '../test-card-schema.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    ${CARD_SCHEMA}
    CREATE TABLE pages(id INTEGER PRIMARY KEY,name TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0);
    INSERT INTO pages VALUES(1,'Home',0),(2,'Lab',1);
    CREATE TABLE service_groups(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,position INTEGER NOT NULL DEFAULT 0,columns INTEGER,page_id INTEGER);
    CREATE TABLE integration_instances(id INTEGER PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,public_config TEXT NOT NULL,secret_ref TEXT,certificate_ref TEXT);
    CREATE TABLE integration_migrations(name TEXT PRIMARY KEY);
    CREATE TABLE integration_widgets(id INTEGER PRIMARY KEY,integration_id INTEGER NOT NULL,type TEXT NOT NULL,name TEXT NOT NULL,public_config TEXT NOT NULL,service_id INTEGER);
    CREATE TABLE page_widgets(id INTEGER PRIMARY KEY,page_id INTEGER NOT NULL REFERENCES pages(id),type TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',config TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,size TEXT NOT NULL DEFAULT 'normal',connection_id INTEGER REFERENCES integration_instances(id),position INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE config_version(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO config_version VALUES(1,1);
    CREATE TABLE agent_identities(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT UNIQUE,scopes TEXT,revoked_at INTEGER,created_at INTEGER);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE service_proposals(id TEXT PRIMARY KEY,author_id TEXT,diff TEXT,base_hash TEXT,base_version INTEGER,expires_at INTEGER,state TEXT,created_at INTEGER,reviewed_at INTEGER,reviewer TEXT,batch_id TEXT);
    CREATE TRIGGER service_proposal_immutable BEFORE UPDATE OF author_id,diff,base_hash,base_version,created_at ON service_proposals BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE audit_events(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,proposal_id TEXT,result TEXT,created_at INTEGER,detail TEXT);
    INSERT INTO integration_instances VALUES(1,'coolify','Coolify','{"url":"https://c.example","allowPrivate":false}','encrypted-secret',NULL),(2,'jellyfin','Media','{}','encrypted-secret',NULL);
    INSERT INTO page_widgets(id,page_id,type,name,config,position) VALUES(1,1,'clock','A','{}',0),(2,1,'clock','B','{}',1),(3,1,'clock','C','{}',2);
  `);
  const api = createProposalService(db);
  const agent = api.issue('agent', ['widgets:propose']);
  return { db, api, agent };
}
const create = (extra: Record<string, unknown> = {}) => ({
  kind: 'widget' as const,
  change: {
    op: 'page-create' as const,
    pageId: 1,
    type: 'clock',
    connectionId: null,
    name: 'New',
    position: 1,
    ...extra,
  },
});
const order = (db: DatabaseSync, pageId = 1) =>
  (
    db
      .prepare('SELECT name,position FROM page_widgets WHERE page_id=? ORDER BY position')
      .all(pageId) as { name: string; position: number }[]
  ).map((row) => `${row.name}:${row.position}`);

describe('page widget proposals', () => {
  it('creates a page widget only on approval, shows the layout diff and audits it', () => {
    const { db, api, agent } = fixture();
    try {
      const proposal = api.proposeManaged(agent.id, create());
      expect(JSON.stringify(proposal.diff)).not.toContain('encrypted-secret');
      expect(proposal.diff).toMatchObject({
        change: {
          change: { pageId: 1, type: 'clock', connectionId: null, position: 1, name: 'New' },
        },
        before: { pages: [{ id: 1 }, { id: 2 }], widgets: expect.any(Array) },
      });
      expect(order(db)).toEqual(['A:0', 'B:1', 'C:2']);
      api.decide(proposal.id, true, 'local-admin');
      expect(order(db)).toEqual(['A:0', 'New:1', 'B:2', 'C:3']);
      expect(db.prepare('SELECT config FROM page_widgets WHERE name=?').get('New')).toBeTruthy();
      expect(
        db.prepare("SELECT detail FROM audit_events WHERE action='page-widget-create'").get(),
      ).toEqual({ detail: 'widget:4 page:1 type:clock' });
    } finally {
      db.close();
    }
  });
  it('creates a connection-backed widget and shows the connection without secrets', () => {
    const { db, api, agent } = fixture();
    try {
      const proposal = api.proposeManaged(
        agent.id,
        create({ type: 'coolify-resources', connectionId: 1, position: 3 }),
      );
      expect(JSON.stringify(proposal.diff)).toContain('"type":"coolify"');
      expect(JSON.stringify(proposal.diff)).not.toContain('encrypted-secret');
      api.decide(proposal.id, true, 'local-admin');
      expect(order(db)).toEqual(['A:0', 'B:1', 'C:2', 'New:3']);
    } finally {
      db.close();
    }
  });
  it.each([
    ['unknown-page', { pageId: 99 }],
    ['unknown-connection', { type: 'coolify-resources', connectionId: 99 }],
    ['unknown-connection', { type: 'coolify-resources', connectionId: null }],
    ['unsupported-type', { type: 'no-such-widget' }],
    ['unsupported-type', { type: 'coolify-resources', connectionId: 2 }],
    ['unsupported-type', { type: 'clock', connectionId: 1 }],
    ['invalid-position', { position: 4 }],
  ])('rejects %s with a stable reason code', (code, extra) => {
    const { db, api, agent } = fixture();
    try {
      expect(() => api.proposeManaged(agent.id, create(extra))).toThrow(code);
      expect(db.prepare('SELECT COUNT(*) AS n FROM service_proposals').get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });
  it('rejects a full page', () => {
    const { db, api, agent } = fixture();
    try {
      const insert = db.prepare(
        "INSERT INTO page_widgets(page_id,type,name,config,position) VALUES(2,'clock','x','{}',?)",
      );
      for (let index = 0; index < MAX_WIDGETS_PER_PAGE; index += 1) insert.run(index);
      expect(() => api.proposeManaged(agent.id, create({ pageId: 2, position: 0 }))).toThrow(
        'widget-limit',
      );
    } finally {
      db.close();
    }
  });
  it('removes a page widget on approval, renumbers the page and audits it', () => {
    const { db, api, agent } = fixture();
    try {
      const proposal = api.proposeManaged(agent.id, {
        kind: 'widget',
        change: { op: 'page-delete', id: 1 },
      });
      expect(proposal.diff).toMatchObject({
        before: {
          widgets: expect.arrayContaining([expect.objectContaining({ id: 1, type: 'clock' })]),
        },
      });
      expect(order(db)).toEqual(['A:0', 'B:1', 'C:2']);
      api.decide(proposal.id, true, 'local-admin');
      expect(order(db)).toEqual(['B:0', 'C:1']);
      expect(
        db.prepare("SELECT detail FROM audit_events WHERE action='page-widget-delete'").get(),
      ).toEqual({ detail: 'widget:1' });
    } finally {
      db.close();
    }
  });
  it('rejects removing an unknown page widget and leaves integration widgets alone', () => {
    const { db, api, agent } = fixture();
    try {
      expect(() =>
        api.proposeManaged(agent.id, { kind: 'widget', change: { op: 'page-delete', id: 99 } }),
      ).toThrow('widget-not-found');
    } finally {
      db.close();
    }
  });
});
