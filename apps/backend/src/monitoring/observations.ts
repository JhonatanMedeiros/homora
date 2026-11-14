import type { DatabaseSync } from 'node:sqlite';
import {
  CHECK_INTERVAL_DEFAULT,
  type Service,
  type ServiceInsights,
  type UptimeRange,
  type UptimeSummary,
} from '@homora/shared';
import { z } from 'zod';
import type { ServiceStatus } from './monitor.js';
import type { RollupStore } from './rollup.js';
import { monitoringTrustReader } from './trust.js';
import {
  HISTORY_RETENTION,
  LATENCY_SQL,
  signature,
  STATUS_SQL,
  UPTIME_WINDOWS,
  uptimeServicesOf,
  uptimeSummarizerOf,
} from './uptime.js';

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
      'destination-blocked',
      'content-mismatch',
      'cert-expired',
      'cert-invalid',
      'cert-expiring',
      'maintenance',
      'unchecked',
    ]),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    latencyMs: z.number().nonnegative().nullable(),
    expectedStatus: z.string().nullable().optional(),
    certExpiresAt: z.number().int().positive().optional(),
  })
  .strict();
const unchecked: ServiceStatus = {
  status: 'unknown',
  lastAttempt: null,
  reason: 'unchecked',
  httpStatus: null,
  latencyMs: null,
};
/** How long the all-services uptime stays cached; checks arrive every few seconds at most. */
const UPTIME_CACHE_MS = 10_000;
/** Services summarized between two yields to the event loop (about 30 ms on a large inventory). */
const UPTIME_SLICE = 100;
const FAILURE_DETAIL_BARS = 24;
/** Checks read to find where the current outage began (about 8 h at the default interval). */
const FAILURE_DETAIL_LOOKBACK = 500;
/** Latency series ranges: the bucket sizes of the history bars, so both charts line up. */
export const LATENCY_RANGES = ['24h', '7d', '30d'] as const;
const percentileOf = (sorted: number[], q: number) =>
  sorted.length ? (sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? null) : null;

export function createObservationStore(db: DatabaseSync, rollup?: RollupStore) {
  const trust = monitoringTrustReader(db);
  /** Availability of the period before `range`, per service, from the hourly rollup. */
  const previousOf = (range: UptimeRange, now: number) => {
    const { span } = UPTIME_WINDOWS[range];
    return rollup ? rollup.uptimePct(now - 2 * span, now - span) : {};
  };
  /**
   * What the table currently holds for each service (`signature|json`), so a publish only writes
   * rows that changed. `null` means unknown (first publish, or after `clear()`): rewrite everything.
   */
  let published: Map<number, { state: ServiceStatus; sig: string; key: string }> | null = null;
  /** Uptime is expensive on large inventories and moves slowly, so it is cached briefly. */
  const uptimeCache = new Map<string, { at: number; version: string; body: Buffer }>();
  const uptimeInFlight = new Map<string, Promise<Buffer>>();
  const configVersion = () =>
    (
      db.prepare('SELECT version FROM config_version WHERE id=1').get() as
        { version: number } | undefined
    )?.version ?? 0;
  return {
    clear() {
      db.prepare('DELETE FROM service_observations').run();
      published = null;
    },
    publish(services: Service[], states: Record<number, ServiceStatus>) {
      const caHash = trust()?.hash;
      db.exec('BEGIN IMMEDIATE');
      const next = new Map<number, { state: ServiceStatus; sig: string; key: string }>();
      try {
        const insert = db.prepare(
          'INSERT OR REPLACE INTO service_observations(service_id,signature,observation) VALUES(?,?,?)',
        );
        const remove = db.prepare('DELETE FROM service_observations WHERE service_id=?');
        db.prepare('DELETE FROM service_observation_history WHERE observed_at < ?').run(
          Date.now() - HISTORY_RETENTION,
        );
        rollup?.prune();
        const history = db.prepare(
          'INSERT OR IGNORE INTO service_observation_history(service_id,signature,observed_at,observation) VALUES(?,?,?,?)',
        );
        if (published === null) db.prepare('DELETE FROM service_observations').run();
        for (const service of services) {
          const state = states[service.id];
          if (!state) continue;
          const sig = signature(service, caHash);
          const before = published?.get(service.id);
          // The monitor hands over the same state object until a service is probed again.
          if (before && before.state === state && before.sig === sig) {
            next.set(service.id, before);
            continue;
          }
          const parsed = observationSchema.parse(state);
          const json = JSON.stringify(parsed);
          next.set(service.id, { state, sig, key: json });
          if (before && before.sig === sig && before.key === json) continue;
          insert.run(service.id, sig, json);
          if (parsed.lastAttempt) {
            const observedAt = Date.parse(parsed.lastAttempt);
            if (observedAt >= Date.now() - HISTORY_RETENTION && observedAt <= Date.now()) {
              const stored = history.run(service.id, sig, observedAt, json);
              if (stored.changes > 0) rollup?.record(service.id, observedAt, parsed.status);
            }
          }
        }
        if (published) for (const id of published.keys()) if (!next.has(id)) remove.run(id);
        db.exec('COMMIT');
        published = next;
      } catch (error) {
        db.exec('ROLLBACK');
        published = null;
        throw error;
      }
    },
    history(id: number, from: number, to: number, before?: number, limit = 100) {
      const service = db.prepare('SELECT id FROM monitors WHERE id=?').get(id);
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
      const rows = uptimeServicesOf(db, serviceId);
      const result: Record<number, UptimeSummary> = {};
      const summarize = uptimeSummarizerOf(
        db,
        range,
        now,
        serviceId !== undefined,
        previousOf(range, now),
        trust()?.hash,
      );
      for (const row of rows) result[row.id] = summarize(row);
      return result;
    },
    /**
     * JSON body of `uptime(range)` for every service, for the list endpoint. The result is cached for a few
     * seconds (and dropped when the configuration changes), concurrent callers share one
     * computation, and the work is done in slices so the API keeps answering meanwhile.
     */
    uptimeBody(range: UptimeRange, now = Date.now()): Promise<Buffer> {
      const version = `${configVersion()}:${trust()?.hash ?? ''}`;
      const cached = uptimeCache.get(range);
      if (cached && cached.version === version && now - cached.at < UPTIME_CACHE_MS)
        return Promise.resolve(cached.body);
      const key = `${range}:${version}`;
      const pending = uptimeInFlight.get(key);
      if (pending) return pending;
      const work = (async () => {
        const rows = uptimeServicesOf(db);
        const summarize = uptimeSummarizerOf(
          db,
          range,
          now,
          false,
          previousOf(range, now),
          trust()?.hash,
        );
        const result: Record<number, UptimeSummary> = {};
        for (let i = 0; i < rows.length; i += UPTIME_SLICE) {
          for (const row of rows.slice(i, i + UPTIME_SLICE)) result[row.id] = summarize(row);
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        // One shared Buffer: sending a string would copy tens of MB per connection.
        const body = Buffer.from(JSON.stringify(result));
        uptimeCache.set(range, { at: now, version, body });
        return body;
      })().finally(() => uptimeInFlight.delete(key));
      uptimeInFlight.set(key, work);
      return work;
    },
    /**
     * Latency of one service over time: for each slot of the range, the median and 95th
     * percentile of its successful checks (nearest rank), plus the slowest one. Read from raw checks
     * of the current configuration, so only the single-service view pays for it.
     */
    latency(id: number, range: UptimeRange, now = Date.now()) {
      const row = uptimeServicesOf(db, id)[0];
      if (!row) throw new Error('Service not found');
      const { span, bucket } = UPTIME_WINDOWS[range];
      const count = span / bucket;
      const start = now - span;
      const rows = db
        .prepare(
          `SELECT observed_at AS at,${LATENCY_SQL} AS latency FROM service_observation_history
           WHERE service_id=? AND signature=? AND observed_at>=? AND observed_at<=? AND ${STATUS_SQL}='available' AND ${LATENCY_SQL} IS NOT NULL`,
        )
        .all(id, signature(row, trust()?.hash), Math.max(start, now - HISTORY_RETENTION), now) as {
        at: number;
        latency: number;
      }[];
      const slots: number[][] = Array.from({ length: count }, () => []);
      const all: number[] = [];
      for (const { at, latency } of rows) {
        slots[Math.min(count - 1, Math.max(0, Math.floor((at - start) / bucket)))]?.push(latency);
        all.push(latency);
      }
      const round = (value: number | null) => (value === null ? null : Math.round(value));
      all.sort((a, b) => a - b);
      return {
        range,
        bucketMs: bucket,
        start,
        points: slots.map((values, index) => {
          values.sort((a, b) => a - b);
          return {
            start: start + index * bucket,
            p50: round(percentileOf(values, 0.5)),
            p95: round(percentileOf(values, 0.95)),
            max: round(values.at(-1) ?? null),
            checks: values.length,
          };
        }),
        p50: round(percentileOf(all, 0.5)),
        p95: round(percentileOf(all, 0.95)),
        max: round(all.at(-1) ?? null),
      };
    },
    /**
     * What the detail page shows besides the charts: the hourly counts of the last 90 days (the
     * client groups them into its own days), why checks failed over the last 30 days and the latest
     * checks. Failure reasons come from stored observations, never from raw responses.
     */
    insights(id: number, now = Date.now()) {
      const row = uptimeServicesOf(db, id)[0];
      if (!row) throw new Error('Service not found');
      const reasons = db
        .prepare(
          `SELECT json_extract(observation,'$.reason') AS reason,json_extract(observation,'$.httpStatus') AS httpStatus,COUNT(*) AS n
           FROM service_observation_history WHERE service_id=? AND signature=? AND observed_at>=? AND ${STATUS_SQL}='unavailable'
           GROUP BY reason,httpStatus ORDER BY n DESC LIMIT 6`,
        )
        .all(id, signature(row, trust()?.hash), now - HISTORY_RETENTION) as {
        reason: string;
        httpStatus: number | null;
        n: number;
      }[];
      return {
        generatedAt: now,
        heat: rollup ? rollup.hourly(id, now - 90 * 24 * 3_600_000, now + 3_600_000) : [],
        reasons: reasons.map((item) => ({
          reason: item.reason,
          httpStatus: item.httpStatus,
          count: item.n,
        })),
        recent: (
          db
            .prepare(
              `SELECT observed_at AS observedAt,${STATUS_SQL} AS status,json_extract(observation,'$.reason') AS reason,json_extract(observation,'$.httpStatus') AS httpStatus,${LATENCY_SQL} AS latencyMs
               FROM service_observation_history WHERE service_id=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 20`,
            )
            .all(id, now) as ServiceInsights['recent']
        ).map(({ observedAt, status, reason, httpStatus, latencyMs }) => ({
          observedAt,
          status,
          reason,
          httpStatus,
          latencyMs,
        })),
      };
    },
    list(now = Date.now()) {
      const caHash = trust()?.hash;
      const rows = db
        .prepare(
          `SELECT s.id,s.url,s.allow_private AS allowPrivate,s.check_insecure AS checkInsecure,s.check_type AS checkType,s.check_interval AS checkInterval,s.expected_status AS expectedStatus,s.check_path AS checkPath,s.check_url AS checkUrl,s.check_match AS checkMatch,o.signature,o.observation
        FROM monitor_targets s LEFT JOIN service_observations o ON o.service_id=s.id ORDER BY s.id`,
        )
        .all() as unknown as Array<
        Pick<
          Service,
          | 'id'
          | 'url'
          | 'allowPrivate'
          | 'checkInsecure'
          | 'checkType'
          | 'checkInterval'
          | 'expectedStatus'
          | 'checkPath'
          | 'checkUrl'
          | 'checkMatch'
        > & {
          signature: string | null;
          observation: string | null;
        }
      >;
      return rows.map((row) => {
        let state: ServiceStatus = unchecked;
        if (row.observation && row.signature === signature(row, caHash)) {
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
