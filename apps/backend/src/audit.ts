import type { DatabaseSync } from 'node:sqlite';

export type AuditKind = 'access' | 'account' | 'proposal' | 'agent';
export type AuditOutcome = 'success' | 'failure' | 'refused';

const ACTIONS_BY_KIND: Record<AuditKind, readonly string[]> = {
  access: ['login', 'logout'],
  account: ['password-change', 'session-revoke', 'sessions-revoke-others', 'profile-update'],
  proposal: ['proposal', 'review', 'expiry'],
  agent: ['agent-issue', 'agent-revoke', 'agent-rotate'],
};
const RESULTS_BY_OUTCOME: Record<AuditOutcome, readonly string[]> = {
  success: ['ok', 'created', 'approved'],
  failure: ['failed'],
  refused: ['rejected', 'expired'],
};
const kindOf = (action: string) =>
  (Object.keys(ACTIONS_BY_KIND) as AuditKind[]).find((kind) =>
    ACTIONS_BY_KIND[kind].includes(action),
  ) ?? 'account';
const outcomeOf = (result: string): AuditOutcome =>
  result === 'failed'
    ? 'failure'
    : RESULTS_BY_OUTCOME.refused.includes(result)
      ? 'refused'
      : 'success';

export const ANONYMOUS_ACTOR = 'anonymous';
export const FAILED_LOGIN_WINDOW_MS = 15 * 60_000;
const RETENTION_MS = 365 * 24 * 60 * 60_000;

export type AuditInput = {
  actor: string;
  action: string;
  result: string;
  detail?: string | null;
  ipAddress?: string | null;
  proposalId?: string | null;
};

export type AuditFilter = {
  kind?: AuditKind;
  outcome?: AuditOutcome;
  /** Return events older than this event id. */
  before?: number;
  limit?: number;
};

type Row = {
  id: number;
  actor: string;
  action: string;
  result: string;
  created_at: number;
  detail: string | null;
  ip_address: string | null;
  user_name: string | null;
  agent_name: string | null;
};

/**
 * Activity feed over `audit_events`. Never store passwords or typed e-mail addresses here: a
 * failed sign-in keeps only the client address and the attempt count.
 */
export function createAuditLog(sqlite: DatabaseSync, now: () => number = Date.now) {
  try {
    sqlite.prepare('DELETE FROM audit_events WHERE created_at < ?').run(now() - RETENTION_MS);
  } catch {
    /* Retention is best effort. */
  }
  return {
    /** Records an event. A storage failure must never break the action being audited. */
    record(input: AuditInput) {
      try {
        sqlite
          .prepare(
            'INSERT INTO audit_events(actor,action,proposal_id,result,created_at,detail,ip_address) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            input.actor,
            input.action,
            input.proposalId ?? null,
            input.result,
            now(),
            input.detail?.slice(0, 200) ?? null,
            input.ipAddress?.slice(0, 64) ?? null,
          );
      } catch {
        /* Intentionally ignored. */
      }
    },
    /** Failed sign-ins from one address inside the throttle window. */
    recentFailedLogins(ipAddress: string) {
      return (
        sqlite
          .prepare(
            "SELECT COUNT(*) AS count FROM audit_events WHERE action='login' AND result='failed' AND ip_address=? AND created_at>=?",
          )
          .get(ipAddress, now() - FAILED_LOGIN_WINDOW_MS) as { count: number }
      ).count;
    },
    list({ kind, outcome, before, limit = 50 }: AuditFilter = {}) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (kind) {
        where.push(`e.action IN (${ACTIONS_BY_KIND[kind].map(() => '?').join(',')})`);
        params.push(...ACTIONS_BY_KIND[kind]);
      }
      if (outcome) {
        where.push(`e.result IN (${RESULTS_BY_OUTCOME[outcome].map(() => '?').join(',')})`);
        params.push(...RESULTS_BY_OUTCOME[outcome]);
      }
      if (before !== undefined) {
        where.push('e.id < ?');
        params.push(before);
      }
      const size = Math.min(Math.max(limit, 1), 100);
      const rows = sqlite
        .prepare(
          `SELECT e.id,e.actor,e.action,e.result,e.created_at,e.detail,e.ip_address,
                  u.name AS user_name, a.name AS agent_name
           FROM audit_events e
           LEFT JOIN "user" u ON e.actor = 'user:' || u.id
           LEFT JOIN agent_identities a ON e.actor = a.id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY e.id DESC LIMIT ?`,
        )
        .all(...params, size + 1) as Row[];
      const page = rows.slice(0, size);
      return {
        events: page.map((row) => ({
          id: row.id,
          createdAt: row.created_at,
          kind: kindOf(row.action),
          action: row.action,
          outcome: outcomeOf(row.result),
          actor: row.actor.startsWith('user:')
            ? { type: 'user' as const, name: row.user_name }
            : row.actor === ANONYMOUS_ACTOR
              ? { type: 'anonymous' as const, name: null }
              : { type: 'agent' as const, name: row.agent_name },
          detail: row.detail,
          ipAddress: row.ip_address,
        })),
        nextBefore: rows.length > size ? (page.at(-1)?.id ?? null) : null,
      };
    },
  };
}

export type AuditLog = ReturnType<typeof createAuditLog>;
