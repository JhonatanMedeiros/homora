import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { validateService } from '@homora/shared';
import { createServiceConfiguration, type ServiceChange } from './service-configuration.js';
import { serviceProposalSchema } from './input-schemas.js';
import { AGENT_SCOPES } from './agent-scopes.js';
import { z } from 'zod';
import {
  applyManagedChange,
  managedChangeSchema,
  managedHash,
  managedSnapshot,
} from './managed-proposals.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export { AGENT_SCOPES } from './agent-scopes.js';
type Diff = ServiceChange;
const identityId = z.string().regex(/^[0-9a-f]{32}$/);
const identityScopes = z
  .array(z.enum(AGENT_SCOPES))
  .min(1)
  .max(AGENT_SCOPES.length)
  .refine((items) => new Set(items).size === items.length);
export const agentChangeSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('create'),
      name: z.string().trim().min(1).max(80),
      scopes: identityScopes,
    })
    .strict(),
  z.object({ op: z.literal('update-scopes'), id: identityId, scopes: identityScopes }).strict(),
  z.object({ op: z.literal('revoke'), id: identityId }).strict(),
  z.object({ op: z.literal('rotate'), id: identityId }).strict(),
]);
export function createProposalService(
  sqlite: DatabaseSync,
  configuration = createServiceConfiguration(sqlite),
) {
  const configHash = configuration.configHash;
  let insideBatch = false;
  let currentBatchId: string | null = null;
  const transaction = <T>(work: () => T): T =>
    insideBatch ? work() : configuration.transaction(work);
  function proposalTtlMinutes() {
    const row = sqlite
      .prepare("SELECT value FROM app_settings WHERE key='proposal_ttl_minutes'")
      .get() as { value: string } | undefined;
    const value = Number(row?.value ?? 15);
    if (!Number.isInteger(value) || value < 1 || value > 120)
      throw new Error('Invalid proposal TTL');
    return value;
  }
  function setProposalTtlMinutes(value: number, human: string) {
    if (!Number.isInteger(value) || value < 1 || value > 120)
      throw new Error('Invalid proposal TTL');
    return configuration.transaction(() => {
      sqlite
        .prepare(
          "INSERT INTO app_settings(key,value) VALUES('proposal_ttl_minutes',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(String(value));
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(human, 'proposal-ttl-update', null, 'ok', Date.now());
    });
  }
  function checkPending(authorId: string) {
    const count = sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM service_proposals WHERE author_id=? AND state='pending' AND expires_at>?",
      )
      .get(authorId, Date.now()) as { count: number };
    if (count.count >= 100) throw new Error('Pending proposal limit reached');
  }
  // The trailing `null` keeps the hashes of pending proposals created before this change.
  const managedBaseHash = () => hash([managedHash(sqlite), null]);
  const proxmoxConfigured = () => {
    const marker = sqlite
      .prepare("SELECT name FROM integration_migrations WHERE name LIKE 'legacy-proxmox:%'")
      .get() as { name: string } | undefined;
    if (marker) {
      const id = Number(marker.name.slice('legacy-proxmox:'.length));
      return (
        Number.isSafeInteger(id) &&
        id > 0 &&
        Boolean(
          sqlite
            .prepare("SELECT id FROM integration_instances WHERE id=? AND type='proxmox'")
            .get(id),
        )
      );
    }
    return false;
  };
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
  function propose(authorId: string, input: unknown, guard?: () => boolean) {
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
        if (service.expectedStatus === undefined) service.expectedStatus = current.expectedStatus;
        if (service.checkPath === undefined) service.checkPath = current.checkPath;
      }
      diff = d.op === 'create' ? { op: 'create', service } : { op: 'update', id: d.id, service };
    }
    const id = randomBytes(16).toString('hex'),
      now = Date.now();
    const baseVersion = configuration.version();
    return transaction(() => {
      if (guard && !guard()) throw new Error('Source unavailable');
      checkPending(authorId);
      const expiresAt = now + proposalTtlMinutes() * 60_000;
      sqlite
        .prepare(
          'INSERT INTO service_proposals(id,author_id,diff,base_hash,base_version,expires_at,state,created_at,batch_id) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          authorId,
          JSON.stringify(diff),
          configHash(),
          baseVersion,
          expiresAt,
          'pending',
          now,
          currentBatchId,
        );
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(authorId, 'proposal', id, 'created', now);
      return { id, diff, expiresAt, state: 'pending' };
    });
  }
  function proposeManaged(authorId: string, input: unknown) {
    const change = managedChangeSchema.parse(input);
    return transaction(() => {
      checkPending(authorId);
      const snapshot = managedSnapshot(sqlite);
      const baseHash = managedBaseHash();
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
      const expiresAt = now + proposalTtlMinutes() * 60_000;
      sqlite
        .prepare(
          'INSERT INTO service_proposals(id,author_id,diff,base_hash,base_version,expires_at,state,created_at,batch_id) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          authorId,
          JSON.stringify(diff),
          baseHash,
          baseVersion,
          expiresAt,
          'pending',
          now,
          currentBatchId,
        );
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(authorId, 'proposal', id, 'created', now);
      return { id, diff, expiresAt, state: 'pending' };
    });
  }
  function proposeBatch(authorId: string, items: { kind: string; change: unknown }[]) {
    if (!items.length || items.length > 20) throw new Error('Invalid batch');
    return configuration.transaction(() => {
      insideBatch = true;
      try {
        const batchId = randomBytes(16).toString('hex');
        currentBatchId = batchId;
        const proposals = items.map((item) => {
          const proposal =
            item.kind === 'service'
              ? propose(authorId, item.change)
              : proposeManaged(authorId, { kind: item.kind, change: item.change });
          return { ...proposal, batchId };
        });
        return { batchId, proposals };
      } finally {
        insideBatch = false;
        currentBatchId = null;
      }
    });
  }
  function proposeAgent(authorId: string, input: unknown) {
    const change = agentChangeSchema.parse(input);
    return transaction(() => {
      checkPending(authorId);
      const author = sqlite
        .prepare('SELECT scopes FROM agent_identities WHERE id=? AND revoked_at IS NULL')
        .get(authorId) as { scopes: string } | undefined;
      const allowed = z
        .array(z.enum(AGENT_SCOPES))
        .parse(JSON.parse(author?.scopes ?? 'null') as unknown);
      if (
        !allowed.includes('agents:propose') ||
        ('scopes' in change && change.scopes.some((scope) => !allowed.includes(scope)))
      )
        throw new Error('Scope denied');
      const target =
        'id' in change
          ? sqlite
              .prepare(
                'SELECT id,name,scopes,revoked_at AS revokedAt,token_hash AS tokenHash FROM agent_identities WHERE id=?',
              )
              .get(change.id)
          : null;
      if ('id' in change && (!target || target.revokedAt !== null))
        throw new Error('Identity unavailable');
      const before = target
        ? { id: target.id, name: target.name, scopes: JSON.parse(String(target.scopes)) as unknown }
        : null;
      const diff = { kind: 'agent', change, before };
      const id = randomBytes(16).toString('hex');
      const now = Date.now();
      const expiresAt = now + proposalTtlMinutes() * 60_000;
      sqlite
        .prepare(
          'INSERT INTO service_proposals(id,author_id,diff,base_hash,base_version,expires_at,state,created_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          authorId,
          JSON.stringify(diff),
          hash(target),
          configuration.version(),
          expiresAt,
          'pending',
          now,
        );
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(authorId, 'proposal', id, 'created', now);
      return { id, diff, expiresAt, state: 'pending' };
    });
  }
  function recreate(id: string, human: string) {
    return configuration.transaction(() => {
      const original = sqlite.prepare('SELECT * FROM service_proposals WHERE id=?').get(id) as
        | {
            id: string;
            author_id: string;
            diff: string;
            state: string;
            expires_at: number;
            batch_id: string | null;
          }
        | undefined;
      const now = Date.now();
      if (
        !original ||
        !(
          (original.state === 'pending' && original.expires_at <= now) ||
          original.state === 'expired'
        )
      )
        throw new Error('Proposal is unavailable');
      const rows = original.batch_id
        ? (sqlite
            .prepare('SELECT * FROM service_proposals WHERE batch_id=? ORDER BY rowid')
            .all(original.batch_id) as (typeof original)[])
        : [original];
      if (
        rows.some(
          (row) =>
            !row ||
            row.author_id !== original.author_id ||
            !((row.state === 'pending' && row.expires_at <= now) || row.state === 'expired'),
        )
      )
        throw new Error('Batch is unavailable');
      insideBatch = true;
      currentBatchId = original.batch_id ? randomBytes(16).toString('hex') : null;
      try {
        const recreated = rows.map((row) => {
          const decoded = JSON.parse(row.diff) as Record<string, unknown>;
          const result =
            decoded.kind === 'managed'
              ? proposeManaged(row.author_id, decoded.change)
              : decoded.kind === 'agent'
                ? proposeAgent(row.author_id, decoded.change)
                : propose(row.author_id, decoded);
          if (JSON.stringify(result.diff) !== row.diff) throw new Error('Proposal diff changed');
          sqlite
            .prepare(
              'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
            )
            .run(human, 'proposal-recreate', result.id, 'created', now, row.id);
          return result;
        });
        return { proposals: recreated, batchId: currentBatchId };
      } finally {
        insideBatch = false;
        currentBatchId = null;
      }
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
              batch_id: string | null;
            }
          | undefined;
        const now = Date.now();
        if (!p || p.state !== 'pending' || p.expires_at <= now)
          throw new Error('Proposal is unavailable');
        if (human === p.author_id) throw new Error('Agent cannot approve its own proposal');
        if (p.batch_id && accept) throw new Error('Batch requires collective review');
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
        if (
          typeof decoded === 'object' &&
          decoded !== null &&
          'kind' in decoded &&
          decoded.kind === 'agent' &&
          'change' in decoded
        ) {
          const change = agentChangeSchema.parse(decoded.change);
          const target =
            'id' in change
              ? sqlite
                  .prepare(
                    'SELECT id,name,scopes,revoked_at AS revokedAt,token_hash AS tokenHash FROM agent_identities WHERE id=?',
                  )
                  .get(change.id)
              : null;
          if (
            hash(target) !== p.base_hash ||
            ('id' in change && (!target || target.revokedAt !== null))
          )
            throw new Error('Configuration has changed');
          let token: string | undefined;
          let agentId: string;
          if (change.op === 'create') {
            const issued = issue(change.name, change.scopes);
            token = issued.token;
            agentId = issued.id;
          } else {
            agentId = change.id;
            if (change.op === 'update-scopes')
              sqlite
                .prepare('UPDATE agent_identities SET scopes=? WHERE id=?')
                .run(JSON.stringify(change.scopes), change.id);
            if (change.op === 'revoke') revoke(change.id);
            if (change.op === 'rotate') token = rotate(change.id);
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
            .run(human, `agent-${change.op}`, id, 'ok', now);
          sqlite
            .prepare(
              'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
            )
            .run(human, 'review', id, 'approved', now);
          return { state: 'approved' as const, agentId, ...(token ? { token } : {}) };
        }
        const isManaged =
          typeof decoded === 'object' &&
          decoded !== null &&
          'kind' in decoded &&
          decoded.kind === 'managed';
        const managedChange =
          isManaged && 'change' in decoded ? managedChangeSchema.parse(decoded.change) : null;
        if (
          version !== p.base_version ||
          (managedChange ? managedBaseHash() : configHash()) !== p.base_hash
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
  function decideBatch(batchId: string, accept: boolean, human: string) {
    try {
      return configuration.transaction(() => {
        const rows = sqlite
          .prepare('SELECT * FROM service_proposals WHERE batch_id=? ORDER BY rowid')
          .all(batchId) as {
          id: string;
          author_id: string;
          diff: string;
          base_hash: string;
          base_version: number;
          expires_at: number;
          state: string;
        }[];
        const now = Date.now();
        if (!rows.length || rows.some((p) => p.author_id === human))
          throw new Error('Proposal is unavailable');
        const pending = rows.filter((p) => p.state === 'pending' && p.expires_at > now);
        if (!pending.length || (accept && pending.length !== rows.length))
          throw new Error('Proposal is unavailable');
        const version = configuration.version();
        if (accept) {
          // Every fingerprint is checked against the original state before any changes are applied.
          for (const p of rows) {
            const decoded = JSON.parse(p.diff) as Record<string, unknown>;
            const managed =
              decoded.kind === 'managed' ? managedChangeSchema.parse(decoded.change) : null;
            if (
              version !== p.base_version ||
              (managed ? managedBaseHash() : configHash()) !== p.base_hash
            )
              throw new Error('Configuration has changed');
          }
          try {
            for (const p of rows) {
              const decoded = JSON.parse(p.diff) as Record<string, unknown>;
              if (decoded.kind === 'managed') {
                applyManagedChange(
                  sqlite,
                  managedChangeSchema.parse(decoded.change),
                  proxmoxConfigured,
                );
              } else {
                const change = serviceProposalSchema.parse(decoded) as ServiceChange;
                if (change.op === 'create')
                  change.service.position = configuration.nextServicePosition(
                    change.service.category,
                  );
                configuration.applyProposal(change);
              }
            }
          } catch {
            throw new Error('Batch changes conflict');
          }
          // One logical decision is one configuration revision, even for mixed changes.
          sqlite.prepare('UPDATE config_version SET version=? WHERE id=1').run(version + 1);
        }
        for (const p of pending) {
          const state = accept ? 'approved' : 'rejected';
          sqlite
            .prepare(
              "UPDATE service_proposals SET state=?,reviewed_at=?,reviewer=? WHERE id=? AND state='pending'",
            )
            .run(state, now, human, p.id);
          sqlite
            .prepare(
              'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
            )
            .run(human, 'review', p.id, state, now);
        }
        return accept ? 'approved' : 'rejected';
      });
    } catch (error) {
      try {
        sqlite
          .prepare(
            'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
          )
          .run(human, 'review', batchId, 'failed', Date.now());
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
    const rows = sqlite
      .prepare(
        'SELECT id,author_id as author,diff,base_hash as baseHash,base_version as baseVersion,expires_at as expiresAt,state,created_at as createdAt,reviewed_at as reviewedAt,reviewer,batch_id as batchId FROM service_proposals ORDER BY created_at DESC',
      )
      .all() as {
      state: string;
      diff: string;
      baseHash: string;
      baseVersion: number;
      batchId: string | null;
    }[];
    return rows.map((p) => {
      if (p.state !== 'pending') return p;
      const decoded = JSON.parse(p.diff) as Record<string, unknown>;
      if (decoded.kind === 'agent') return p;
      const managed = decoded.kind === 'managed' ? managedChangeSchema.parse(decoded.change) : null;
      const incomplete =
        p.batchId && rows.some((other) => other.batchId === p.batchId && other.state !== 'pending');
      return incomplete ||
        p.baseVersion !== configuration.version() ||
        p.baseHash !== (managed ? managedBaseHash() : configHash())
        ? { ...p, state: 'stale' }
        : p;
    });
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
                expires_at AS expiresAt,created_at AS createdAt,reviewed_at AS reviewedAt,batch_id AS batchId
         FROM service_proposals WHERE author_id=? ORDER BY created_at DESC LIMIT 200`,
      )
      .all(now, authorId);
  }
  function getOwn(authorId: string, id: string) {
    return sqlite
      .prepare(
        `SELECT id,diff,CASE WHEN state='pending' AND expires_at<=? THEN 'expired' ELSE state END AS state,
                expires_at AS expiresAt,created_at AS createdAt,reviewed_at AS reviewedAt,batch_id AS batchId
         FROM service_proposals WHERE author_id=? AND id=?`,
      )
      .get(Date.now(), authorId, id);
  }
  function withdraw(authorId: string, id: string) {
    return configuration.transaction(() => {
      const now = Date.now();
      const changed = sqlite
        .prepare(
          "UPDATE service_proposals SET state='withdrawn',reviewed_at=? WHERE id=? AND author_id=? AND state='pending' AND expires_at>?",
        )
        .run(now, id, authorId, now);
      if (!changed.changes) throw new Error('Proposal unavailable');
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(authorId, 'withdraw', id, 'withdrawn', now);
      return { id, state: 'withdrawn' };
    });
  }
  return {
    issue,
    authenticate,
    revoke,
    rotate,
    propose,
    proposeManaged,
    proposeBatch,
    proposeAgent,
    recreate,
    proposalTtlMinutes,
    setProposalTtlMinutes,
    decide,
    decideBatch,
    list,
    listAgents,
    listOwn,
    getOwn,
    withdraw,
    configHash,
  };
}
