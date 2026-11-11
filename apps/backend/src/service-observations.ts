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
        for (const service of services) {
          const state = states[service.id];
          if (state)
            insert.run(
              service.id,
              signature(service),
              JSON.stringify(observationSchema.parse(state)),
            );
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
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
