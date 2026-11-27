import type { DatabaseSync } from 'node:sqlite';
import { serviceProposalSchema } from '../input-schemas.js';
import type { createServiceConfiguration } from '../service-configuration.js';
import {
  applyManagedChange,
  isIndependentChange,
  managedChangeSchema,
  type ManagedChange,
} from './managed-proposals.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;

export type StaleReason = 'batch' | 'target-gone' | 'config-changed' | 'agent' | 'recreate';

type Row = {
  id: string;
  author_id: string;
  diff: string;
  base_hash: string;
  base_version: number;
  expires_at: number;
  state: string;
  batch_id: string | null;
};

/**
 * Re-bases a stale proposal on the current configuration without changing what was asked: the
 * requested change is kept, only the snapshot it was checked against is renewed. A proposal whose
 * target is gone cannot be refreshed and says so.
 */
export function createProposalRefresh({
  sqlite,
  configuration,
  configHash,
  managedBaseHash,
}: {
  sqlite: DatabaseSync;
  configuration: Configuration;
  configHash: () => string;
  managedBaseHash: (change?: ManagedChange) => string;
}) {
  function managedOf(decoded: Record<string, unknown>) {
    return decoded.kind === 'managed' ? managedChangeSchema.parse(decoded.change) : null;
  }

  function isStale(row: Row, decoded: Record<string, unknown>) {
    const managed = managedOf(decoded);
    return (
      (row.base_version !== configuration.version() &&
        !isIndependentChange(managed ?? undefined)) ||
      row.base_hash !== (managed ? managedBaseHash(managed) : configHash())
    );
  }

  /** Whether the change could still be applied now: tried inside a savepoint that is undone. */
  function stillApplies(decoded: Record<string, unknown>) {
    const managed = managedOf(decoded);
    if (!managed) {
      const change = serviceProposalSchema.parse(decoded);
      return change.op === 'create' || Boolean(configuration.findService(change.id));
    }
    sqlite.exec('SAVEPOINT proposal_refresh_probe');
    try {
      applyManagedChange(sqlite, managed);
      return true;
    } catch {
      return false;
    } finally {
      sqlite.exec('ROLLBACK TO proposal_refresh_probe');
      sqlite.exec('RELEASE proposal_refresh_probe');
    }
  }

  /** Why a stale proposal cannot be approved as it is, for the card to explain. */
  function reasonFor(decoded: Record<string, unknown>, batchId: string | null): StaleReason {
    if (decoded.kind === 'agent') return 'agent';
    if (batchId) return 'batch';
    if (managedOf(decoded)?.kind === 'connection-delete') return 'recreate';
    return stillApplies(decoded) ? 'config-changed' : 'target-gone';
  }

  function refresh(id: string, human: string) {
    return configuration.transaction(() => {
      const row = sqlite.prepare('SELECT * FROM service_proposals WHERE id=?').get(id) as
        | Row
        | undefined;
      const now = Date.now();
      if (!row || row.state !== 'pending' || row.expires_at <= now || row.batch_id)
        throw new Error('Proposal is unavailable');
      const decoded = JSON.parse(row.diff) as Record<string, unknown>;
      if (decoded.kind === 'agent') throw new Error('Proposal is unavailable');
      if (managedOf(decoded)?.kind === 'connection-delete')
        throw new Error('Proposal is unavailable');
      if (!isStale(row, decoded)) throw new Error('Proposal is not stale');
      if (!stillApplies(decoded)) throw new Error('Target is gone');
      const nextVersion = configuration.version();
      const managed = managedOf(decoded);
      const nextHash = managed ? managedBaseHash(managed) : configHash();
      sqlite
        .prepare('UPDATE service_proposals SET base_hash=?,base_version=? WHERE id=?')
        .run(nextHash, nextVersion, id);
      sqlite
        .prepare(
          'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
        )
        .run(
          human,
          'proposal-refresh',
          id,
          'ok',
          now,
          `version:${row.base_version}->${nextVersion} base:${row.base_hash.slice(0, 8)}->${nextHash.slice(0, 8)}`,
        );
      return { id, state: 'pending' as const };
    });
  }

  const destructive = (decoded: Record<string, unknown>) => {
    const inner = decoded.change as { op?: unknown; change?: { op?: unknown } } | undefined;
    return (
      decoded.op === 'delete' ||
      inner?.change?.op === 'delete' ||
      ['delete', 'unlink', 'cancel', 'remove'].includes(String(inner?.op))
    );
  };

  /**
   * Refreshes every stale, still applicable proposal that does not destroy anything. Destructive
   * ones are left for an explicit confirmation, so nothing is ever renewed silently.
   */
  function refreshStale(human: string) {
    const rows = sqlite
      .prepare(
        "SELECT id,diff FROM service_proposals WHERE state='pending' AND batch_id IS NULL AND expires_at>?",
      )
      .all(Date.now()) as { id: string; diff: string }[];
    let refreshed = 0;
    for (const { id, diff } of rows) {
      const decoded = JSON.parse(diff) as Record<string, unknown>;
      if (decoded.kind === 'agent' || destructive(decoded)) continue;
      try {
        refresh(id, human);
        refreshed += 1;
      } catch {
        // Not stale, or its target is gone: nothing to renew.
      }
    }
    return { refreshed };
  }

  return { refresh, refreshStale, reasonFor, isStale };
}
