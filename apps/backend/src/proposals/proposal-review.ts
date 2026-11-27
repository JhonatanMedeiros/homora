import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { serviceProposalSchema } from '../input-schemas.js';
import type { agentChangeSchema } from '../agents/agent-changes.js';
import { createServiceConfiguration, type ServiceChange } from '../service-configuration.js';
import {
  applyManagedChange,
  isIndependentChange,
  managedChangeSchema,
} from './managed-proposals.js';
import type { ManagedChange } from './managed-proposals.js';
import { MaintenanceError } from '../monitoring/index.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** How long a rejection can be taken back. */
export const UNDO_WINDOW_MS = 60_000;

type AgentChangeSchema = typeof agentChangeSchema;

export function createProposalReviewService({
  sqlite,
  configuration,
  agentChangeSchema,
  managedBaseHash,
  configHash,
  issue,
  revoke,
  rotate,
}: {
  sqlite: DatabaseSync;
  configuration: ReturnType<typeof createServiceConfiguration>;
  agentChangeSchema: AgentChangeSchema;
  managedBaseHash: (change?: ManagedChange) => string;
  configHash: () => string;
  issue: (name: string, scopes: string[]) => { id: string; token: string };
  revoke: (id: string) => void;
  rotate: (id: string) => string;
}) {
  function applyServiceChange(
    change: ServiceChange,
    human: string,
    proposalId: string,
    now: number,
  ) {
    const before = change.op === 'update' ? configuration.findService(change.id) : undefined;
    const result = configuration.applyProposal(change);
    if (change.op !== 'delete' && result && typeof result === 'object') {
      const after = Boolean(result.checkInsecure);
      if (Boolean(before?.checkInsecure) !== after) {
        sqlite
          .prepare(
            'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
          )
          .run(
            human,
            'monitoring-tls-insecure',
            proposalId,
            'ok',
            now,
            `service:${result.id}:${after ? 'on' : 'off'}`,
          );
      }
    }
  }
  function auditManagedChange(
    change: ManagedChange,
    human: string,
    proposalId: string,
    now: number,
    affectedId?: number,
  ) {
    if (change.kind === 'connection-delete') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(human, 'connection-delete', proposalId, 'ok', now, `connection:${affectedId}`);
      return;
    }
    if (change.kind === 'widget' && change.change.op === 'move') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(
          human,
          'page-widget-move',
          proposalId,
          'ok',
          now,
          `widget:${change.change.id} page:${change.change.pageId}`,
        );
      return;
    }
    if (
      change.kind === 'widget' &&
      (change.change.op === 'page-create' || change.change.op === 'page-delete')
    ) {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(
          human,
          change.change.op === 'page-create' ? 'page-widget-create' : 'page-widget-delete',
          proposalId,
          'ok',
          now,
          change.change.op === 'page-create'
            ? `widget:${affectedId} page:${change.change.pageId} type:${change.change.type}`
            : `widget:${affectedId}`,
        );
      return;
    }
    if (change.kind === 'pin') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(
          human,
          change.change.op === 'reorder'
            ? 'service-pin-order'
            : change.change.op === 'pin'
              ? 'service-pin'
              : 'service-unpin',
          proposalId,
          'ok',
          now,
          change.change.op === 'reorder' ? 'reordered' : `service:${affectedId}`,
        );
      return;
    }
    if (change.kind === 'link') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(
          human,
          change.change.op === 'link' ? 'resource-link-set' : 'resource-link-remove',
          proposalId,
          'ok',
          now,
          `service:${affectedId}`,
        );
      return;
    }
    if (change.kind === 'public-visibility') {
      // Same event the UI route records (routes/public-status.ts), so history reads the same either way.
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(
          human,
          'service-public',
          proposalId,
          'ok',
          now,
          `${affectedId}:${change.change.isPublic ? 'public' : 'private'}`,
        );
      return;
    }
    if (change.kind === 'acknowledgement') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(
          human,
          change.change.op === 'ack' ? 'service-acknowledge' : 'service-acknowledge-clear',
          proposalId,
          'ok',
          now,
          `service:${affectedId}`,
        );
      return;
    }
    if (change.kind === 'tag') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(human, 'service-tags-update', proposalId, 'ok', now, `service:${affectedId}`);
      return;
    }
    if (change.kind === 'probe') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(human, `probe-${change.change.op}`, proposalId, 'ok', now, `probe:${affectedId}`);
      return;
    }
    if (change.kind === 'page') {
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(human, 'page-update', proposalId, 'ok', now, change.change.op);
      return;
    }
    if (change.kind !== 'maintenance') return;
    sqlite
      .prepare(
        'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
      )
      .run(
        human,
        change.change.op === 'create' ? 'service-maintenance-create' : 'service-maintenance-delete',
        proposalId,
        'ok',
        now,
        `${change.change.serviceId}:${change.change.op === 'cancel' ? change.change.id : `${change.change.startsAt}/${change.change.endsAt}`}`,
      );
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
          (version !== p.base_version && !isIndependentChange(managedChange ?? undefined)) ||
          (managedChange ? managedBaseHash(managedChange) : configHash()) !== p.base_hash
        )
          throw new Error('Configuration has changed');
        if (managedChange) {
          const affectedId = applyManagedChange(sqlite, managedChange);
          auditManagedChange(managedChange, human, id, now, affectedId);
        } else {
          const d = serviceProposalSchema.parse(decoded);
          applyServiceChange(d as ServiceChange, human, id, now);
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
        // The original error is rethrown below; a second failure while recording it adds nothing.
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
        if (rows.length === 0 || rows.some((p) => p.author_id === human))
          throw new Error('Proposal is unavailable');
        const pending = rows.filter((p) => p.state === 'pending' && p.expires_at > now);
        if (pending.length === 0 || (accept && pending.length !== rows.length))
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
              (managed ? managedBaseHash(managed) : configHash()) !== p.base_hash
            )
              throw new Error('Configuration has changed');
          }
          try {
            for (const p of rows) {
              const decoded = JSON.parse(p.diff) as Record<string, unknown>;
              if (decoded.kind === 'managed') {
                const change = managedChangeSchema.parse(decoded.change);
                const affectedId = applyManagedChange(sqlite, change);
                auditManagedChange(change, human, p.id, now, affectedId);
              } else {
                const change = serviceProposalSchema.parse(decoded) as ServiceChange;
                if (change.op === 'create')
                  change.service.position = configuration.nextServicePosition(
                    change.service.category,
                  );
                applyServiceChange(change, human, p.id, now);
              }
            }
          } catch (error) {
            if (
              error instanceof MaintenanceError ||
              (error instanceof Error && error.message === 'maintenance-not-found')
            )
              throw error;
            throw new Error('Batch changes conflict', { cause: error });
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
        // The original error is rethrown below; a second failure while recording it adds nothing.
      }
      throw error;
    }
  }
  /**
   * Takes back a rejection made moments ago by the same reviewer: the proposal waits again.
   * Approvals are not undone, since they already changed the configuration.
   */
  function undoRejection(idOrBatch: string, batch: boolean, human: string) {
    return configuration.transaction(() => {
      const now = Date.now();
      const rows = sqlite
        .prepare(
          `SELECT id FROM service_proposals WHERE ${batch ? 'batch_id' : 'id'}=? AND state='rejected' AND reviewer=? AND reviewed_at>=? AND expires_at>?`,
        )
        .all(idOrBatch, human, now - UNDO_WINDOW_MS, now) as { id: string }[];
      if (rows.length === 0) throw new Error('Proposal is unavailable');
      for (const { id } of rows) {
        sqlite
          .prepare(
            "UPDATE service_proposals SET state='pending',reviewed_at=NULL,reviewer=NULL WHERE id=? AND state='rejected'",
          )
          .run(id);
        sqlite
          .prepare(
            'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
          )
          .run(human, 'review-undo', id, 'ok', now);
      }
      return 'pending' as const;
    });
  }
  return { decide, decideBatch, undoRejection };
}
