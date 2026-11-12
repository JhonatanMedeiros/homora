import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { CHECK_INTERVAL_DEFAULT, type Service } from '@homora/shared';
import { z } from 'zod';
import type { ServiceStatus } from './service-monitor.js';

const observationSchema = z
  .object({
    status: z.enum(['available', 'unavailable', 'unknown']),
    lastAttempt: z.iso.datetime().nullable(),
    reason: z.enum([
      'responding',
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
function signature(service: Pick<Service, 'url' | 'allowPrivate' | 'checkType' | 'checkInterval'>) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        service.url,
        Boolean(service.allowPrivate),
        service.checkType ?? 'http',
        service.checkInterval ?? null,
      ]),
    )
    .digest('hex');
}
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
          .map(({ observedAt, status, reason, httpStatus, latencyMs }) => ({
            observedAt,
            status,
            reason,
            httpStatus,
            latencyMs,
          })),
        failingSince: failing ? (events[run - 1]?.observedAt ?? null) : null,
        // The outage began before the checks that were read, so `failingSince` is a lower bound.
        failingSinceIsApproximate: failing && run === events.length,
        lastSuccess: lastSuccess
          ? { observedAt: lastSuccess.observedAt, latencyMs: lastSuccess.latencyMs }
          : null,
      };
    },
    list(now = Date.now()) {
      const rows = db
        .prepare(
          `SELECT s.id,s.url,s.allow_private AS allowPrivate,s.check_type AS checkType,s.check_interval AS checkInterval,o.signature,o.observation
        FROM services s LEFT JOIN service_observations o ON o.service_id=s.id ORDER BY s.id`,
        )
        .all() as unknown as Array<
        Pick<Service, 'id' | 'url' | 'allowPrivate' | 'checkType' | 'checkInterval'> & {
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
