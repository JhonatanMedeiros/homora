import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { validateService } from '@homora/shared';
import { createServiceConfiguration, type ServiceChange } from './service-configuration.js';
import { serviceProposalSchema } from './input-schemas.js';
import { AGENT_SCOPES } from './agent-scopes.js';
import type { createVault } from './vault.js';
import {
  applyManagedChange,
  managedChangeSchema,
  managedHash,
  managedSnapshot,
} from './managed-proposals.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export { AGENT_SCOPES } from './agent-scopes.js';
type Diff = ServiceChange;
export function createProposalService(
  sqlite: DatabaseSync,
  configuration = createServiceConfiguration(sqlite),
  vault?: ReturnType<typeof createVault>,
) {
  const configHash = configuration.configHash;
  const isProxmoxWidget = (change: ReturnType<typeof managedChangeSchema.parse>) =>
    change.kind === 'widget' && change.change.op === 'create' && change.change.source === 'proxmox';
  const managedBaseHash = (change: ReturnType<typeof managedChangeSchema.parse>) =>
    hash([managedHash(sqlite), isProxmoxWidget(change) ? (vault?.load() ?? null) : null]);
  const proxmoxConfigured = () => Boolean(vault?.load());
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
    const parsed = serviceProposalSchema.safeParse(input);
    if (!parsed.success) throw new Error('Invalid proposal');
    const d = parsed.data;
    let diff: Diff;
    if (d.op === 'delete') {
      if (!configuration.findService(d.id)) throw new Error('Service not found');
      diff = { op: 'delete', id: d.id };
    } else {
      const service = validateService(d.service);
      if (d.op === 'create') {
        service.position = configuration.nextServicePosition(service.category);
        service.allowPrivate = d.service.allowPrivate === true;
        service.checkType ??= 'http';
        service.checkInterval ??= null;
      } else {
        const current = configuration.findService(d.id);
        if (!current) throw new Error('Service not found');
        service.position = d.service.position === undefined ? current.position : d.service.position;
        service.allowPrivate =
          d.service.allowPrivate === undefined
            ? Boolean(current.allowPrivate)
            : d.service.allowPrivate;
        if (service.checkType === undefined) service.checkType = current.checkType;
        if (service.checkInterval === undefined) service.checkInterval = current.checkInterval;
      }
      diff = d.op === 'create' ? { op: 'create', service } : { op: 'update', id: d.id, service };
    }
    const id = randomBytes(16).toString('hex'),
      now = Date.now();
    const baseVersion = configuration.version();
    configuration.transaction(() => {
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
    });
    return { id, diff, expiresAt: now + 15 * 60_000, state: 'pending' };
  }
  function proposeManaged(authorId: string, input: unknown) {
    const change = managedChangeSchema.parse(input);
    return configuration.transaction(() => {
      const snapshot = managedSnapshot(sqlite);
      const baseHash = managedBaseHash(change);
      const baseVersion = configuration.version();
      // Validate the exact operation without retaining the simulated changes.
      sqlite.exec('SAVEPOINT validate_proposal');
      try {
        applyManagedChange(sqlite, change, proxmoxConfigured);
      } finally {
        sqlite.exec('ROLLBACK TO validate_proposal; RELEASE validate_proposal');
      }
      const targetId = 'id' in change.change ? change.change.id : undefined;
      const integrationId =
        'integrationId' in change.change ? change.change.integrationId : undefined;
      const widgetRows =
        change.kind === 'widget' && change.change.op !== 'create'
          ? snapshot.widgets.filter((row) => row.id === targetId)
          : [];
      const widgetConnectionId = integrationId ?? widgetRows[0]?.integration_id;
      const widgetServiceIds = [
        widgetRows[0]?.service_id,
        'serviceId' in change.change ? change.change.serviceId : undefined,
      ];
      const relevantGroups =
        change.kind === 'group'
          ? change.change.op === 'create'
            ? []
            : change.change.op === 'reorder'
              ? snapshot.groups
              : snapshot.groups.filter((row) => row.id === targetId)
          : [];
      const relevantCategories =
        change.kind === 'card-order'
          ? change.change.op === 'reorder'
            ? [change.change.category]
            : [
                change.change.targetCategory,
                snapshot.services.find((row) => row.id === targetId)?.category,
              ]
          : relevantGroups.map((row) => row.name);
      const before =
        change.kind === 'group' || change.kind === 'card-order'
          ? {
              groups: relevantGroups,
              services: snapshot.services
                .filter((row) => relevantCategories.includes(row.category))
                .map(({ id, name, category, position }) => ({ id, name, category, position })),
            }
          : change.kind === 'widget'
            ? {
                widgets: widgetRows.map(({ id, integration_id, type, name, service_id }) => ({
                  id,
                  integration_id,
                  type,
                  name,
                  service_id,
                })),
                connections: snapshot.connections
                  .filter((row) => row.id === widgetConnectionId)
                  .map(({ id, type, name }) => ({ id, type, name })),
                services: snapshot.services
                  .filter((row) => widgetServiceIds.includes(row.id))
                  .map(({ id, name }) => ({ id, name })),
              }
            : null;
      const diff = { kind: 'managed', change, before };
      const id = randomBytes(16).toString('hex');
      const now = Date.now();
      sqlite
        .prepare(
          'INSERT INTO service_proposals(id,author_id,diff,base_hash,base_version,expires_at,state,created_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          authorId,
          JSON.stringify(diff),
          baseHash,
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
      return { id, diff, expiresAt: now + 15 * 60_000, state: 'pending' };
    });
  }
  function decide(id: string, accept: boolean, human: string) {
    try {
      return configuration.transaction(() => {
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
          return 'rejected';
        }
        const version = configuration.version();
        const decoded: unknown = JSON.parse(p.diff);
        const isManaged =
          typeof decoded === 'object' &&
          decoded !== null &&
          'kind' in decoded &&
          decoded.kind === 'managed';
        const managedChange =
          isManaged && 'change' in decoded ? managedChangeSchema.parse(decoded.change) : null;
        if (
          version !== p.base_version ||
          (managedChange ? managedBaseHash(managedChange) : configHash()) !== p.base_hash
        )
          throw new Error('Configuration has changed');
        if (managedChange) {
          applyManagedChange(sqlite, managedChange, proxmoxConfigured);
        } else {
          const d = serviceProposalSchema.parse(decoded);
          configuration.applyProposal(d as ServiceChange);
        }
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
        return 'approved';
      });
    } catch (error) {
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
  function listOwn(authorId: string) {
    const now = Date.now();
    return sqlite
      .prepare(
        `SELECT id,diff,CASE WHEN state='pending' AND expires_at<=? THEN 'expired' ELSE state END AS state,
                expires_at AS expiresAt,created_at AS createdAt,reviewed_at AS reviewedAt
         FROM service_proposals WHERE author_id=? ORDER BY created_at DESC LIMIT 200`,
      )
      .all(now, authorId);
  }
  function getOwn(authorId: string, id: string) {
    return sqlite
      .prepare(
        `SELECT id,diff,CASE WHEN state='pending' AND expires_at<=? THEN 'expired' ELSE state END AS state,
                expires_at AS expiresAt,created_at AS createdAt,reviewed_at AS reviewedAt
         FROM service_proposals WHERE author_id=? AND id=?`,
      )
      .get(Date.now(), authorId, id);
  }
  return {
    issue,
    authenticate,
    revoke,
    rotate,
    propose,
    proposeManaged,
    decide,
    list,
    listAgents,
    listOwn,
    getOwn,
    configHash,
  };
}
