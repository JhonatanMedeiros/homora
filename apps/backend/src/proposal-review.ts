import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { serviceProposalSchema } from './input-schemas.js';
import type { agentChangeSchema } from './agent-changes.js';
import { createServiceConfiguration, type ServiceChange } from './service-configuration.js';
import { applyManagedChange, managedChangeSchema } from './managed-proposals.js';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

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
  managedBaseHash: () => string;
  configHash: () => string;
  issue: (name: string, scopes: string[]) => { id: string; token: string };
  revoke: (id: string) => void;
  rotate: (id: string) => string;
}) {
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
          applyManagedChange(sqlite, managedChange);
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
                applyManagedChange(sqlite, managedChangeSchema.parse(decoded.change));
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
  return { decide, decideBatch };
}
