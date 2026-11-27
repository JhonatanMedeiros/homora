import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { createServiceConfiguration } from '../service-configuration.js';
import { applyManagedChange, managedChangeSchema } from './managed-proposals.js';

/** Names the rejected batch item with a stable, sanitized reason; it never carries internal details. */
export class BatchItemError extends Error {
  constructor(
    readonly index: number,
    readonly kind: string,
    readonly code: string,
  ) {
    super(`batch-item-invalid: items[${index}] (${kind}): ${code}`);
  }
}

/** Reasons are static short phrases or kebab-case codes; anything else collapses to a generic code. */
function reasonCode(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  return /^[A-Za-z][A-Za-z -]{0,59}$/.test(message)
    ? message.trim().toLowerCase().replaceAll(/ +/g, '-')
    : 'invalid-change';
}

type ProposalBatchContext = {
  insideBatch: boolean;
  currentBatchId: string | null;
};

type ProposalResult = {
  id: string;
  diff: unknown;
  expiresAt: number;
  state: string;
};

type CreateProposal = (authorId: string, input: unknown) => ProposalResult;

/** Coordinates atomic proposal batches and recreates expired batches without changing their diffs. */
export function createProposalBatches({
  sqlite,
  configuration,
  context,
  proposeService,
  proposeManaged,
  proposeAgent,
}: {
  sqlite: DatabaseSync;
  configuration: ReturnType<typeof createServiceConfiguration>;
  context: ProposalBatchContext;
  proposeService: CreateProposal;
  proposeManaged: CreateProposal;
  proposeAgent: CreateProposal;
}) {
  /** Applies the managed items in order on the unchanged state, then reverts: later items see earlier ones. */
  function validateTogether(entries: { kind: string; diff: unknown }[]) {
    sqlite.exec('SAVEPOINT validate_batch');
    let index = 0;
    let kind = '';
    try {
      entries.forEach((entry, position) => {
        index = position;
        kind = entry.kind;
        const decoded = entry.diff as {
          kind?: unknown;
          change?: unknown;
        } | null;
        if (decoded?.kind === 'managed')
          applyManagedChange(sqlite, managedChangeSchema.parse(decoded.change));
      });
    } catch (error) {
      throw new BatchItemError(index, kind, reasonCode(error));
    } finally {
      sqlite.exec('ROLLBACK TO validate_batch; RELEASE validate_batch');
    }
  }

  function proposeBatch(authorId: string, items: { kind: string; change: unknown }[]) {
    if (items.length === 0 || items.length > 20) throw new Error('Invalid batch');
    if (items.some((item) => item.kind === 'connection-delete')) throw new Error('Invalid batch');
    return configuration.transaction(() => {
      context.insideBatch = true;
      try {
        const batchId = randomBytes(16).toString('hex');
        context.currentBatchId = batchId;
        const proposals = items.map((item, index) => {
          try {
            const proposal =
              item.kind === 'service'
                ? proposeService(authorId, item.change)
                : proposeManaged(authorId, {
                    kind: item.kind,
                    change: item.change,
                  });
            return { ...proposal, batchId };
          } catch (error) {
            if (error instanceof Error && error.message === 'Pending proposal limit reached')
              throw error;
            throw new BatchItemError(index, item.kind, reasonCode(error));
          }
        });
        validateTogether(
          items.map((item, index) => ({
            kind: item.kind,
            diff: proposals[index].diff,
          })),
        );
        return { batchId, proposals };
      } finally {
        context.insideBatch = false;
        context.currentBatchId = null;
      }
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

      context.insideBatch = true;
      context.currentBatchId = original.batch_id ? randomBytes(16).toString('hex') : null;
      try {
        const recreated = rows.map((row) => {
          const decoded = JSON.parse(row.diff) as Record<string, unknown>;
          const result =
            decoded.kind === 'managed'
              ? proposeManaged(row.author_id, decoded.change)
              : decoded.kind === 'agent'
                ? proposeAgent(row.author_id, decoded.change)
                : proposeService(row.author_id, decoded);
          if (JSON.stringify(result.diff) !== row.diff) throw new Error('Proposal diff changed');
          sqlite
            .prepare(
              'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail) VALUES(?,?,?,?,?,?)',
            )
            .run(human, 'proposal-recreate', result.id, 'created', now, row.id);
          return result;
        });
        if (original.batch_id)
          validateTogether(
            recreated.map((item, index) => ({
              kind: `item-${index}`,
              diff: item.diff,
            })),
          );
        return { proposals: recreated, batchId: context.currentBatchId };
      } finally {
        context.insideBatch = false;
        context.currentBatchId = null;
      }
    });
  }

  return { proposeBatch, recreate };
}
