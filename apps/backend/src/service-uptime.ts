import type { DatabaseSync } from 'node:sqlite';
import { type Service, type UptimeRange, type UptimeSummary } from '@homora/shared';
import { serviceSignature } from './service-signature.js';

/** History is retained for 30 days, shared with observation publishing and history reads. */
export const HISTORY_RETENTION = 30 * 24 * 60 * 60_000;
/** Bucket sizes keep every range at 120 points or fewer. */
export const UPTIME_WINDOWS: Record<UptimeRange, { span: number; bucket: number }> = {
  '24h': { span: 24 * 3_600_000, bucket: 30 * 60_000 },
  '7d': { span: 7 * 24 * 3_600_000, bucket: 2 * 3_600_000 },
  '30d': { span: 30 * 24 * 3_600_000, bucket: 6 * 3_600_000 },
};
/** Below this many up/down checks a percentage would mislead, so none is reported. */
const UPTIME_MIN_CHECKS = 5;
// Virtual columns generated from the observation JSON (migration 0015) and covered by an index.
export const STATUS_SQL = 'status';
export const LATENCY_SQL = 'latency_ms';
type SignedService = Pick<
  Service,
  | 'url'
  | 'allowPrivate'
  | 'checkType'
  | 'checkInterval'
  | 'expectedStatus'
  | 'checkPath'
  | 'checkMatch'
>;
type UptimeService = SignedService & { id: number };
export const signature = serviceSignature;

/** Services whose uptime is reported: all of them, or just one. */
export function uptimeServicesOf(db: DatabaseSync, serviceId?: number): UptimeService[] {
  return db
    .prepare(
      `SELECT id,url,allow_private AS allowPrivate,check_type AS checkType,check_interval AS checkInterval,expected_status AS expectedStatus,check_path AS checkPath,check_match AS checkMatch FROM services WHERE (? IS NULL OR id=?) ORDER BY id`,
    )
    .all(serviceId ?? null, serviceId ?? null) as unknown as UptimeService[];
}

/** Prepares the statements once and returns the summary of one service in the given window. */
export function uptimeSummarizerOf(
  db: DatabaseSync,
  range: UptimeRange,
  now: number,
  single: boolean,
  previous: Record<number, number | null> = {},
) {
  const { span, bucket } = UPTIME_WINDOWS[range];
  const count = span / bucket;
  const since = Math.max(now - span, now - HISTORY_RETENTION);
  const start = now - span;
  const grouped = db.prepare(
    `SELECT CAST((observed_at-?)/? AS INTEGER) AS slot,${STATUS_SQL} AS status,COUNT(*) AS n,AVG(${LATENCY_SQL}) AS latency,MAX(observed_at) AS lastAt
         FROM service_observation_history WHERE service_id=? AND signature=? AND observed_at>=? AND observed_at<=?
         GROUP BY slot,status`,
  );
  // Why each period failed: the grouped query already knows when the last failure of each period
  // happened, so only that one row (at most one per period) has its JSON read.
  const failureAt = db.prepare(
    `SELECT json_extract(observation,'$.reason') AS reason,json_extract(observation,'$.httpStatus') AS httpStatus
         FROM service_observation_history WHERE service_id=? AND signature=? AND observed_at=?`,
  );
  const other = db.prepare(
    'SELECT 1 FROM service_observation_history WHERE service_id=? AND signature<>? AND observed_at>=? AND observed_at<=? LIMIT 1',
  );
  const last = db.prepare(
    `SELECT ${LATENCY_SQL} AS latency FROM service_observation_history WHERE service_id=? AND signature=? AND observed_at>=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 1`,
  );
  const timed = db.prepare(
    `SELECT COUNT(*) AS n FROM service_observation_history WHERE service_id=? AND signature=? AND observed_at>=? AND observed_at<=? AND ${STATUS_SQL}='available' AND ${LATENCY_SQL} IS NOT NULL`,
  );
  const percentile = db.prepare(
    `SELECT ${LATENCY_SQL} AS latency FROM service_observation_history WHERE service_id=? AND signature=? AND observed_at>=? AND observed_at<=? AND ${STATUS_SQL}='available' AND ${LATENCY_SQL} IS NOT NULL ORDER BY latency LIMIT 1 OFFSET ?`,
  );
  return (row: UptimeService): UptimeSummary => {
    const sig = signature(row);
    const args = [row.id, sig, since, now] as const;
    const slots = Array.from({ length: count }, () => ({
      up: 0,
      down: 0,
      unknown: 0,
      latencySum: 0,
      lastFailureAt: 0,
      reason: undefined as string | undefined,
      httpStatus: null as number | null,
    }));
    let up = 0;
    let down = 0;
    let unknown = 0;
    for (const group of grouped.all(start, bucket, row.id, sig, since, now) as {
      slot: number;
      status: string;
      n: number;
      latency: number | null;
      lastAt: number;
    }[]) {
      const slot = slots[Math.min(Math.max(group.slot, 0), count - 1)];
      if (!slot) continue;
      if (group.status === 'available') {
        slot.up += group.n;
        slot.latencySum += (group.latency ?? 0) * group.n;
        up += group.n;
      } else if (group.status === 'unavailable') {
        slot.down += group.n;
        slot.lastFailureAt = group.lastAt;
        down += group.n;
      } else {
        slot.unknown += group.n;
        unknown += group.n;
      }
    }
    for (const slot of slots) {
      if (!slot.lastFailureAt) continue;
      const detail = failureAt.get(row.id, sig, slot.lastFailureAt) as
        { reason: string | null; httpStatus: number | null } | undefined;
      if (!detail) continue;
      slot.reason = detail.reason ?? undefined;
      slot.httpStatus = detail.httpStatus;
    }
    const counted = up + down;
    // The percentile needs a sort of every latency, so only the single-service call pays for it.
    let p95: number | null | undefined;
    if (single) {
      const timedCount = (timed.get(...args) as { n: number }).n;
      p95 = timedCount
        ? (percentile.get(...args, Math.ceil(timedCount * 0.95) - 1) as { latency: number }).latency
        : null;
    }
    const latest = last.get(...args) as { latency: number | null } | undefined;
    return {
      range,
      uptimePct: counted >= UPTIME_MIN_CHECKS ? Math.round((up / counted) * 10_000) / 100 : null,
      checks: counted + unknown,
      downChecks: down,
      unknownChecks: unknown,
      lastLatencyMs: latest?.latency ?? null,
      previousUptimePct: previous[row.id] ?? null,
      ...(p95 === undefined ? {} : { p95LatencyMs: p95 }),
      reconfigured: other.get(row.id, sig, since, now) !== undefined,
      buckets: slots.map((slot, index) => ({
        start: new Date(start + index * bucket).toISOString(),
        status: slot.up && slot.down ? 'partial' : slot.down ? 'down' : slot.up ? 'up' : 'unknown',
        checks: slot.up + slot.down + slot.unknown,
        avgLatencyMs: slot.up ? Math.round(slot.latencySum / slot.up) : null,
        ...(slot.down && slot.reason ? { reason: slot.reason, httpStatus: slot.httpStatus } : {}),
      })),
    };
  };
}
