import { createHash, randomBytes } from 'node:crypto';
import { createAgentIdentityService } from '../agents/agent-identities.js';
import type { DatabaseSync } from 'node:sqlite';
import { validateService } from '@homora/shared';
import { createServiceConfiguration, type ServiceChange } from '../service-configuration.js';
import { serviceProposalSchema } from '../input-schemas.js';
import { createManagedProposalCreator } from './managed-proposal-creator.js';
import { createProposalReviewService } from './proposal-review.js';
import { managedHash } from './managed-proposals.js';
import { createProposalRefresh } from './proposal-refresh.js';
import { createProposalQueries } from './proposal-queries.js';
import { createProposalBatches } from './proposal-batches.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Diff = ServiceChange;
import { agentChangeSchema } from '../agents/agent-changes.js';
import { AGENT_SCOPES } from '../agents/agent-scopes.js';
import { z } from 'zod';
export { agentChangeSchema, AGENT_SCOPES };
export function createProposalService(
  sqlite: DatabaseSync,
  configuration = createServiceConfiguration(sqlite),
  onConnectionDeleted: (id: number) => void = () => {},
) {
  const configHash = configuration.configHash;
  const batchContext = { insideBatch: false, currentBatchId: null as string | null };
  const transaction = <T>(work: () => T): T =>
    batchContext.insideBatch ? work() : configuration.transaction(work);
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
  const managedBaseHash = (change?: import('./managed-proposals.js').ManagedChange) =>
    hash([
      managedHash(sqlite),
      change?.kind === 'pin'
        ? change.change.op === 'reorder'
          ? {
              pins: sqlite.prepare('SELECT * FROM service_pins ORDER BY service_id').all(),
              order:
                sqlite
                  .prepare("SELECT value FROM app_settings WHERE key='service_pin_order'")
                  .get() ?? null,
            }
          : (sqlite
              .prepare('SELECT * FROM service_pins WHERE service_id=?')
              .get(change.change.serviceId) ?? null)
        : change?.kind === 'link'
          ? sqlite
              .prepare('SELECT * FROM integration_resource_links WHERE service_id=?')
              .all(change.change.serviceId)
          : change?.kind === 'acknowledgement'
            ? {
                acknowledgements: sqlite
                  .prepare('SELECT * FROM service_acknowledgements WHERE service_id=?')
                  .all(change.change.serviceId),
                incidents: sqlite
                  .prepare(
                    'SELECT id,service_id,ended_at FROM service_incidents WHERE service_id=? ORDER BY id',
                  )
                  .all(change.change.serviceId),
              }
            : change?.kind === 'public-visibility'
              ? (sqlite
                  .prepare('SELECT id,is_public FROM monitors WHERE id=?')
                  .get(change.change.serviceId) ?? null)
              : change?.kind === 'tag'
                ? sqlite
                    .prepare(
                      'SELECT service_id,tag FROM service_tags WHERE service_id=? ORDER BY tag',
                    )
                    .all(change.change.serviceId)
                : change?.kind === 'probe'
                  ? change.change.op === 'create'
                    ? // Only an identical probe already in place matters to a new one.
                      sqlite
                        .prepare(
                          'SELECT m.* FROM monitors m WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.id=m.id) AND m.name=? AND m.check_url=? ORDER BY m.id',
                        )
                        .all(change.change.probe.name, change.change.probe.address)
                    : sqlite
                        .prepare(
                          'SELECT m.* FROM monitors m WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.id=m.id) AND m.id=?',
                        )
                        .all(change.change.id)
                  : null,
    ]);
  /**
   * A pending proposal that already asks for exactly this (same kind, same change, same base), so
   * a repeated suggestion returns it instead of queueing a second creation. Batch items never match.
   */
  function findDuplicate(diff: unknown, baseHash: string, baseVersion?: number) {
    if (batchContext.currentBatchId) return null;
    const effect = (value: unknown) => {
      const d = value as { kind?: unknown; change?: unknown } | null;
      return JSON.stringify(d && typeof d === 'object' && 'kind' in d ? [d.kind, d.change] : value);
    };
    const wanted = effect(diff);
    const rows = sqlite
      .prepare(
        "SELECT id,diff,expires_at AS expiresAt,base_version AS baseVersion FROM service_proposals WHERE state='pending' AND batch_id IS NULL AND expires_at>? AND base_hash=? ORDER BY created_at DESC",
      )
      .all(Date.now(), baseHash) as {
      id: string;
      diff: string;
      expiresAt: number;
      baseVersion: number;
    }[];
    const match = rows.find(
      (row) =>
        (baseVersion === undefined || row.baseVersion === baseVersion) &&
        effect(JSON.parse(row.diff)) === wanted,
    );
    return match
      ? {
          id: match.id,
          diff: JSON.parse(match.diff) as unknown,
          expiresAt: match.expiresAt,
          state: 'pending' as const,
        }
      : null;
  }
  const {
    issue,
    authenticate,
    revoke,
    rotate,
    list: listAgents,
  } = createAgentIdentityService(sqlite);
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
        service.openTarget ??= 'new-tab';
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
        if (service.openTarget === undefined) service.openTarget = current.openTarget;
        if (service.checkType === undefined) service.checkType = current.checkType;
        if (service.checkInterval === undefined) service.checkInterval = current.checkInterval;
        if (service.expectedStatus === undefined) service.expectedStatus = current.expectedStatus;
        if (service.checkPath === undefined) service.checkPath = current.checkPath;
        if (service.checkUrl === undefined) service.checkUrl = current.checkUrl;
        if (service.checkMatch === undefined) service.checkMatch = current.checkMatch;
        if (service.alias === undefined) service.alias = current.alias ?? null;
        if (service.checkInsecure === undefined)
          service.checkInsecure = Boolean(current.checkInsecure);
      }
      if (service.checkInsecure && !service.allowPrivate) throw new Error('Invalid proposal');
      if (d.op === 'create') configuration.checkNewServicePage(service.category, d.page);
      diff =
        d.op === 'create'
          ? { op: 'create', service, ...(d.page ? { page: d.page } : {}) }
          : { op: 'update', id: d.id, service };
    }
    const id = randomBytes(16).toString('hex'),
      now = Date.now();
    const baseVersion = configuration.version();
    return transaction(() => {
      if (guard && !guard()) throw new Error('Source unavailable');
      const duplicate = findDuplicate(diff, configHash(), baseVersion);
      if (duplicate) return duplicate;
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
          batchContext.currentBatchId,
        );
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
        )
        .run(authorId, 'proposal', id, 'created', now);
      return { id, diff, expiresAt, state: 'pending' };
    });
  }
  const proposeManaged = createManagedProposalCreator({
    sqlite,
    configuration,
    transaction,
    checkPending,
    managedBaseHash,
    proposalTtlMinutes,
    getBatchId: () => batchContext.currentBatchId,
    findDuplicate,
  });
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
      const duplicate = findDuplicate(diff, hash(target));
      if (duplicate) return duplicate;
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
  const { proposeBatch, recreate } = createProposalBatches({
    sqlite,
    configuration,
    context: batchContext,
    proposeService: propose,
    proposeManaged,
    proposeAgent,
  });
  const {
    decide: review,
    decideBatch,
    undoRejection,
  } = createProposalReviewService({
    sqlite,
    configuration,
    agentChangeSchema,
    managedBaseHash,
    configHash,
    issue,
    revoke,
    rotate,
  });
  function decide(id: string, accept: boolean, human: string) {
    const row = sqlite.prepare('SELECT diff FROM service_proposals WHERE id=?').get(id) as
      | { diff: string }
      | undefined;
    const decision = review(id, accept, human);
    if (decision === 'approved' && row) {
      const decoded = JSON.parse(row.diff) as {
        kind?: string;
        change?: { kind?: string; change?: { id?: number } };
      };
      if (
        decoded.kind === 'managed' &&
        decoded.change?.kind === 'connection-delete' &&
        decoded.change.change?.id
      )
        onConnectionDeleted(decoded.change.change.id);
    }
    return decision;
  }
  const { refresh, refreshStale, reasonFor } = createProposalRefresh({
    sqlite,
    configuration,
    configHash,
    managedBaseHash,
  });
  const { list, listOwn, getOwn, withdraw } = createProposalQueries({
    sqlite,
    configuration,
    configHash,
    managedBaseHash,
    staleReason: reasonFor,
  });
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
    undoRejection,
    list,
    listAgents,
    listOwn,
    getOwn,
    withdraw,
    refresh,
    refreshStale,
    configHash,
  };
}
