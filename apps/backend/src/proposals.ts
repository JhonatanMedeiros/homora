import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { validateService } from '@homora/shared';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const AGENT_SCOPES = ['services:read', 'proxmox:read', 'proposals:create'] as const;
type Diff = { op: 'create' | 'update' | 'delete'; id?: number; service?: unknown };
export function createProposalService(sqlite: DatabaseSync) {
  const state = sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as
    { version: number } | undefined;
  if (!state) sqlite.prepare('INSERT INTO config_version(id, version) VALUES(1, 1)').run();
  const snapshot = () =>
    sqlite
      .prepare(
        'SELECT id,name,url,category,description,icon,position,allow_private as allowPrivate FROM services ORDER BY id',
      )
      .all();
  const configHash = () => hash(snapshot());
  function issue(name: string, scopes: string[]) {
    if (
      !name.trim() ||
      name.length > 80 ||
      !scopes.length ||
      scopes.some((s) => !(AGENT_SCOPES as readonly string[]).includes(s))
    )
      throw new Error('Invalid agent identity');
    const token = randomBytes(32).toString('base64url');
    const id = randomBytes(16).toString('hex');
    sqlite
      .prepare(
        'INSERT INTO agent_identities(id,name,token_hash,scopes,created_at) VALUES(?,?,?,?,?)',
      )
      .run(id, name.trim(), hash(token), JSON.stringify([...new Set(scopes)]), Date.now());
    return { id, name: name.trim(), scopes: [...new Set(scopes)], token };
  }
  function authenticate(token: string | undefined, scope: string) {
    if (!token || token.length > 256) return null;
    const row = sqlite
      .prepare('SELECT id,scopes FROM agent_identities WHERE token_hash=? AND revoked_at IS NULL')
      .get(hash(token)) as { id: string; scopes: string } | undefined;
    if (!row || !(JSON.parse(row.scopes) as string[]).includes(scope)) return null;
    return row.id;
  }
  function revoke(id: string) {
    sqlite
      .prepare('UPDATE agent_identities SET revoked_at=? WHERE id=? AND revoked_at IS NULL')
      .run(Date.now(), id);
  }
  function rotate(id: string) {
    const token = randomBytes(32).toString('base64url');
    const result = sqlite
      .prepare('UPDATE agent_identities SET token_hash=? WHERE id=? AND revoked_at IS NULL')
      .run(hash(token), id);
    if (!result.changes) throw new Error('Identity unavailable');
    return token;
  }
  function propose(authorId: string, input: unknown) {
    if (
      !input ||
      typeof input !== 'object' ||
      Object.keys(input).some((k) => !['op', 'id', 'service'].includes(k))
    )
      throw new Error('Invalid proposal');
    const d = input as Diff;
    if (
      !['create', 'update', 'delete'].includes(d.op) ||
      (d.op !== 'create' && !Number.isSafeInteger(d.id))
    )
      throw new Error('Invalid proposal');
    let diff: Diff;
    if (d.op === 'delete') {
      const id = d.id as number;
      const row = sqlite.prepare('SELECT id FROM services WHERE id=?').get(id);
      if (!row) throw new Error('Service not found');
      diff = { op: 'delete', id };
    } else {
      if (
        !d.service ||
        typeof d.service !== 'object' ||
        Array.isArray(d.service) ||
        Object.keys(d.service as object).some(
          (k) =>
            ![
              'name',
              'url',
              'category',
              'description',
              'icon',
              'position',
              'allowPrivate',
            ].includes(k),
        )
      )
        throw new Error('Invalid service fields');
      const raw = d.service as Record<string, unknown>;
      if (raw.allowPrivate !== undefined && typeof raw.allowPrivate !== 'boolean')
        throw new Error('Invalid allowPrivate');
      const service = validateService(raw as never);
      if (d.op === 'create') {
        const siblings = sqlite
          .prepare('SELECT position FROM services WHERE category=?')
          .all(service.category) as { position: number }[];
        service.position = Math.max(-1, ...siblings.map((s) => s.position)) + 1;
        service.allowPrivate = raw.allowPrivate === true;
      } else {
        const current = sqlite
          .prepare('SELECT position,allow_private as allowPrivate FROM services WHERE id=?')
          .get(d.id as number) as { position: number; allowPrivate: number } | undefined;
        if (!current) throw new Error('Service not found');
        service.position =
          Number.isSafeInteger(raw.position) && Number(raw.position) >= 0
            ? Number(raw.position)
            : current.position;
        service.allowPrivate =
          raw.allowPrivate === undefined ? Boolean(current.allowPrivate) : raw.allowPrivate;
      }
      diff = { op: d.op, id: d.id, service };
    }
    const id = randomBytes(16).toString('hex'),
      now = Date.now();
    const baseVersion = (
      sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as { version: number }
    ).version;
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite
        .prepare(
          'INSERT INTO service_proposals(id,author_id,diff,base_hash,base_version,expires_at,state,created_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          authorId,
          JSON.stringify(diff),
          configHash(),
          baseVersion,
          now + 15 * 60_000,
          'pending',
          now,
        );
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(authorId, 'proposal', id, 'created', now);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    return { id, diff, expiresAt: now + 15 * 60_000, state: 'pending' };
  }
  function decide(id: string, accept: boolean, human: string) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const p = sqlite.prepare('SELECT * FROM service_proposals WHERE id=?').get(id) as
        | {
            id: string;
            author_id: string;
            diff: string;
            base_hash: string;
            base_version: number;
            expires_at: number;
            state: string;
          }
        | undefined;
      const now = Date.now();
      if (!p || p.state !== 'pending' || p.expires_at <= now)
        throw new Error('Proposal is unavailable');
      if (human === p.author_id) throw new Error('Agent cannot approve its own proposal');
      if (!accept) {
        sqlite
          .prepare(
            "UPDATE service_proposals SET state='rejected',reviewed_at=?,reviewer=? WHERE id=? AND state='pending'",
          )
          .run(now, human, id);
        sqlite
          .prepare(
            'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
          )
          .run(human, 'review', id, 'rejected', now);
        sqlite.exec('COMMIT');
        return 'rejected';
      }
      const version = (
        sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as { version: number }
      ).version;
      if (version !== p.base_version || configHash() !== p.base_hash)
        throw new Error('Configuration has changed');
      const d = JSON.parse(p.diff) as Diff;
      if (d.op === 'create') {
        const s = d.service as Record<string, unknown>;
        sqlite
          .prepare(
            'INSERT INTO services(name,url,category,description,icon,position,allow_private) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            String(s.name),
            String(s.url),
            String(s.category),
            String(s.description),
            String(s.icon ?? ''),
            Number(s.position),
            s.allowPrivate === true ? 1 : 0,
          );
      }
      if (d.op === 'update') {
        const s = d.service as Record<string, unknown>;
        sqlite
          .prepare(
            'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=? WHERE id=?',
          )
          .run(
            String(s.name),
            String(s.url),
            String(s.category),
            String(s.description),
            String(s.icon ?? ''),
            Number(s.position),
            s.allowPrivate === true ? 1 : 0,
            d.id as number,
          );
      }
      if (d.op === 'delete') sqlite.prepare('DELETE FROM services WHERE id=?').run(d.id as number);
      sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
      sqlite
        .prepare(
          "UPDATE service_proposals SET state='approved',reviewed_at=?,reviewer=? WHERE id=? AND state='pending'",
        )
        .run(now, human, id);
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(human, 'review', id, 'approved', now);
      sqlite.exec('COMMIT');
      return 'approved';
    } catch (error) {
      sqlite.exec('ROLLBACK');
      try {
        sqlite
          .prepare(
            'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
          )
          .run(human, 'review', id, 'failed', Date.now());
      } catch {
        /* database failure */
      }
      throw error;
    }
  }
  function list() {
    const now = Date.now();
    const expired = sqlite
      .prepare("SELECT id,author_id FROM service_proposals WHERE state='pending' AND expires_at<=?")
      .all(now) as { id: string; author_id: string }[];
    for (const p of expired) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const changed = sqlite
          .prepare(
            "UPDATE service_proposals SET state='expired',reviewed_at=? WHERE id=? AND state='pending' AND expires_at<=?",
          )
          .run(now, p.id, now);
        if (changed.changes)
          sqlite
            .prepare(
              'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
            )
            .run(p.author_id, 'expiry', p.id, 'expired', now);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
    return sqlite
      .prepare(
        'SELECT id,author_id as author,diff,base_hash as baseHash,base_version as baseVersion,expires_at as expiresAt,state,created_at as createdAt,reviewed_at as reviewedAt,reviewer FROM service_proposals ORDER BY created_at DESC',
      )
      .all();
  }
  function listAgents() {
    return sqlite
      .prepare(
        'SELECT id,name,scopes,created_at as createdAt,revoked_at as revokedAt FROM agent_identities ORDER BY created_at DESC',
      )
      .all();
  }
  return {
    issue,
    authenticate,
    revoke,
    rotate,
    propose,
    decide,
    list,
    listAgents,
    configHash,
  };
}
