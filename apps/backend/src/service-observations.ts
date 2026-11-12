import type { DatabaseSync } from 'node:sqlite';
import {
  CHECK_INTERVAL_DEFAULT,
  type Service,
  type UptimeRange,
  type UptimeSummary,
} from '@homora/shared';
import { z } from 'zod';
import type { ServiceStatus } from './service-monitor.js';
import { serviceSignature } from './service-signature.js';

const observationSchema = z
  .object({
    status: z.enum(['available', 'unavailable', 'unknown']),
    lastAttempt: z.iso.datetime().nullable(),
    reason: z.enum([
      'responding',
      'unexpected-status',
      'redirect',
      'login-required',
      'not-found',
      'error-status',
      'reachable',
      'no-response',
      'unchecked',
    ]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    latencyMs: z.number().nonnegative().nullable(),
    expectedStatus: z.string().nullable().optional(),
  })
  .strict();
const unchecked: ServiceStatus = {
  status: 'unknown',
  lastAttempt: null,
  reason: 'unchecked',
  httpStatus: null,
  latencyMs: null,
};
const HISTORY_RETENTION = 30 * 24 * 60 * 60_000;
const FAILURE_DETAIL_BARS = 24;
/** Checks read to find where the current outage began (about 8 h at the default interval). */
const FAILURE_DETAIL_LOOKBACK = 500;
/** Bucket sizes keep every range at 120 points or fewer. */
const UPTIME_WINDOWS: Record<UptimeRange, { span: number; bucket: number }> = {
  '24h': { span: 24 * 3_600_000, bucket: 30 * 60_000 },
  '7d': { span: 7 * 24 * 3_600_000, bucket: 2 * 3_600_000 },
  '30d': { span: 30 * 24 * 3_600_000, bucket: 6 * 3_600_000 },
};
/** Below this many up/down checks a percentage would mislead, so none is reported. */
const UPTIME_MIN_CHECKS = 5;
// Virtual columns generated from the observation JSON (migration 0015) and covered by an index.
const STATUS_SQL = 'status';
const LATENCY_SQL = 'latency_ms';
type SignedService = Pick<
  Service,
  'url' | 'allowPrivate' | 'checkType' | 'checkInterval' | 'expectedStatus' | 'checkPath'
>;
const signature = serviceSignature;
/** Writer is called by the web monitor only; failures must not affect service availability. */
export function createObservationStore(db: DatabaseSync) {
  return {
    clear() {
      db.prepare('DELETE FROM service_observations').run();
    },
    publish(services: Service[], states: Record<number, ServiceStatus>) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM service_observations').run();
        const insert = db.prepare(
          'INSERT INTO service_observations(service_id,signature,observation) VALUES(?,?,?)',
        );
        db.prepare('DELETE FROM service_observation_history WHERE observed_at < ?').run(
          Date.now() - HISTORY_RETENTION,
        );
        const history = db.prepare(
          'INSERT OR IGNORE INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
        );
        for (const service of services) {
          const state = states[service.id];
          if (state) {
            const parsed = observationSchema.parse(state);
            insert.run(service.id, signature(service), JSON.stringify(parsed));
            if (parsed.lastAttempt) {
              const observedAt = Date.parse(parsed.lastAttempt);
              if (observedAt >= Date.now() - HISTORY_RETENTION && observedAt <= Date.now())
                history.run(service.id, signature(service), observedAt, JSON.stringify(parsed));
            }
          }
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    history(id: number, from: number, to: number, before?: number, limit = 100) {
      const service = db.prepare('SELECT id FROM services WHERE id=?').get(id);
      if (!service) throw new Error('Service not found');
      const rows = db
        .prepare(
          'SELECT id,observed_at AS observedAt,observation FROM service_observation_history WHERE service_id=? AND observed_at>=? AND observed_at<=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT ?',
        )
        .all(
          id,
          Math.max(from, Date.now() - HISTORY_RETENTION),
          to,
          before ?? null,
          before ?? null,
          limit + 1,
        ) as { id: number; observedAt: number; observation: string }[];
      const events = rows.slice(0, limit).map((row) => ({
        id: row.id,
        observedAt: row.observedAt,
        ...observationSchema.parse(JSON.parse(row.observation) as unknown),
      }));
      return { events, nextBefore: rows.length > limit ? (events.at(-1)?.id ?? null) : null };
    },
    /**
     * Failure details for one service: the latest checks (oldest first), when the current
     * outage started and the last successful check. Raw responses are never stored.
     */
    detail(id: number, now = Date.now()) {
      const { events } = this.history(id, 0, now, undefined, FAILURE_DETAIL_LOOKBACK);
      let run = 0;
      while (run < events.length && events[run]?.status === 'unavailable') run++;
      const failing = run > 0;
      const lastSuccess = events.find((event) => event.status === 'available');
      return {
        recent: events
          .slice(0, FAILURE_DETAIL_BARS)
          .reverse()
          .map(({ observedAt, status, reason, httpStatus, latencyMs, expectedStatus }) => ({
            observedAt,
            status,
            reason,
            httpStatus,
            latencyMs,
            ...(expectedStatus ? { expectedStatus } : {}),
          })),
        failingSince: failing ? (events[run - 1]?.observedAt ?? null) : null,
        // The outage began before the checks that were read, so `failingSince` is a lower bound.
        failingSinceIsApproximate: failing && run === events.length,
        lastSuccess: lastSuccess
          ? { observedAt: lastSuccess.observedAt, latencyMs: lastSuccess.latencyMs }
          : null,
      };
    },
    /**
     * Availability for one or all services (same code path, so both agree). Only checks made under
     * the service's current configuration count, `unknown` checks are outside the denominator and
     * buckets without checks read `unknown`. Aggregation happens in SQL on a covering index. The
     * 95th percentile (nearest rank) is only computed for a single service.
     */
    uptime(range: UptimeRange, now = Date.now(), serviceId?: number) {
      const { span, bucket } = UPTIME_WINDOWS[range];
      const count = span / bucket;
      const since = Math.max(now - span, now - HISTORY_RETENTION);
      const start = now - span;
      const rows = db
        .prepare(
          `SELECT id,url,allow_private AS allowPrivate,check_type AS checkType,check_interval AS checkInterval,expected_status AS expectedStatus,check_path AS checkPath FROM services WHERE (? IS NULL OR id=?) ORDER BY id`,
        )
        .all(serviceId ?? null, serviceId ?? null) as unknown as (SignedService & { id: number })[];
      const grouped = db.prepare(
        `SELECT CAST((observed_at-?)/? AS INTEGER) AS slot,${STATUS_SQL} AS status,COUNT(*) AS n
         FROM service_observation_history WHERE service_id=? AND signature=? AND observed_at>=? AND observed_at<=?
         GROUP BY slot,status`,
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
      const result: Record<number, UptimeSummary> = {};
      for (const row of rows) {
        const sig = signature(row);
        const args = [row.id, sig, since, now] as const;
        const slots = Array.from({ length: count }, () => ({ up: 0, down: 0, unknown: 0 }));
        let up = 0;
        let down = 0;
        let unknown = 0;
        for (const group of grouped.all(start, bucket, row.id, sig, since, now) as {
          slot: number;
          status: string;
          n: number;
        }[]) {
          const slot = slots[Math.min(Math.max(group.slot, 0), count - 1)];
          if (!slot) continue;
          if (group.status === 'available') {
            slot.up += group.n;
            up += group.n;
          } else if (group.status === 'unavailable') {
            slot.down += group.n;
            down += group.n;
          } else {
            slot.unknown += group.n;
            unknown += group.n;
          }
        }
        const counted = up + down;
        // The percentile needs a sort of every latency, so only the single-service call pays for it.
        let p95: number | null | undefined;
        if (serviceId !== undefined) {
          const timedCount = (timed.get(...args) as { n: number }).n;
          p95 = timedCount
            ? (percentile.get(...args, Math.ceil(timedCount * 0.95) - 1) as { latency: number })
                .latency
            : null;
        }
        const latest = last.get(...args) as { latency: number | null } | undefined;
        result[row.id] = {
          range,
          uptimePct:
            counted >= UPTIME_MIN_CHECKS ? Math.round((up / counted) * 10_000) / 100 : null,
          checks: counted + unknown,
          downChecks: down,
          unknownChecks: unknown,
          lastLatencyMs: latest?.latency ?? null,
          ...(p95 === undefined ? {} : { p95LatencyMs: p95 }),
          reconfigured: other.get(row.id, sig, since, now) !== undefined,
          buckets: slots.map((slot, index) => ({
            start: new Date(start + index * bucket).toISOString(),
            status:
              slot.up && slot.down ? 'partial' : slot.down ? 'down' : slot.up ? 'up' : 'unknown',
          })),
        };
      }
      return result;
    },
    list(now = Date.now()) {
      const rows = db
        .prepare(
          `SELECT s.id,s.url,s.allow_private AS allowPrivate,s.check_type AS checkType,s.check_interval AS checkInterval,s.expected_status AS expectedStatus,s.check_path AS checkPath,o.signature,o.observation
        FROM services s LEFT JOIN service_observations o ON o.service_id=s.id ORDER BY s.id`,
        )
        .all() as unknown as Array<
        Pick<
          Service,
          | 'id'
          | 'url'
          | 'allowPrivate'
          | 'checkType'
          | 'checkInterval'
          | 'expectedStatus'
          | 'checkPath'
        > & {
          signature: string | null;
          observation: string | null;
        }
      >;
      return rows.map((row) => {
        let state: ServiceStatus = unchecked;
        if (row.observation && row.signature === signature(row)) {
          try {
            const parsed = observationSchema.safeParse(JSON.parse(row.observation) as unknown);
            if (parsed.success) state = parsed.data;
          } catch {
            /* corrupt data is unknown */
          }
        }
        const age = state.lastAttempt ? now - Date.parse(state.lastAttempt) : null;
        const stale =
          age !== null &&
          (age < 0 || age > ((row.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 2 + 30) * 1000);
        return {
          id: row.id,
          ...(stale ? { ...unchecked, lastAttempt: state.lastAttempt } : state),
          stale,
        };
      });
    },
  };
}
