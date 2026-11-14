import type { DatabaseSync } from 'node:sqlite';
import type { createServiceConfiguration } from './service-configuration.js';
import { isIndependentChange, managedChangeSchema } from './managed-proposals.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;

/** Proposal listing, expiration, staleness, and author-owned read/withdraw operations. */
export function createProposalQueries({
  sqlite,
  configuration,
  configHash,
  managedBaseHash,
}: {
  sqlite: DatabaseSync;
  configuration: Configuration;
  configHash: () => string;
  managedBaseHash: (change?: import('./managed-proposals.js').ManagedChange) => string;
}) {
  function list() {
    const now = Date.now();
    const expired = sqlite
      .prepare("SELECT id,author_id FROM service_proposals WHERE state='pending' AND expires_at<=?")
      .all(now) as { id: string; author_id: string }[];
    for (const proposal of expired) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const changed = sqlite
          .prepare(
            "UPDATE service_proposals SET state='expired',reviewed_at=? WHERE id=? AND state='pending' AND expires_at<=?",
          )
          .run(now, proposal.id, now);
        if (changed.changes)
          sqlite
            .prepare(
              'INSERT INTO audit_events(actor,action,proposal_id,result,created_at) VALUES(?,?,?,?,?)',
            )
            .run(proposal.author_id, 'expiry', proposal.id, 'expired', now);
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
    return rows.map((proposal) => {
      if (proposal.state !== 'pending') return proposal;
      const decoded = JSON.parse(proposal.diff) as Record<string, unknown>;
      if (decoded.kind === 'agent') return proposal;
      const managed = decoded.kind === 'managed' ? managedChangeSchema.parse(decoded.change) : null;
      const incomplete =
        proposal.batchId &&
        rows.some((other) => other.batchId === proposal.batchId && other.state !== 'pending');
      return incomplete ||
        (proposal.baseVersion !== configuration.version() &&
          !isIndependentChange(managed ?? undefined)) ||
        proposal.baseHash !== (managed ? managedBaseHash(managed) : configHash())
        ? { ...proposal, state: 'stale' }
        : proposal;
    });
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

  return { list, listOwn, getOwn, withdraw };
}
