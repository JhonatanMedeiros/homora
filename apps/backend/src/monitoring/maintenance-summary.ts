import type { DatabaseSync } from 'node:sqlite';
import { CHECK_INTERVAL_DEFAULT, periodicEvidenceFreshness } from '@homora/shared';
import { createObservationStore } from './observations.js';
import { createMonitoringSource } from './service-source.js';

/** A current observation after a finished window, never a claim of recovery or cause. */
export function maintenanceSummary(
  db: DatabaseSync,
  serviceId: number,
  windowId: number,
  now = Date.now(),
) {
  const window = db
    .prepare(
      'SELECT ends_at AS endsAt FROM service_maintenance WHERE id=? AND service_id=? AND ends_at>=?',
    )
    .get(windowId, serviceId, now - 30 * 86_400_000) as { endsAt: number } | undefined;
  if (!window) return null;
  const evaluatedAt = new Date(now).toISOString();
  if (window.endsAt > now) return { state: 'pending' as const, evaluatedAt, observedAt: null };
  const target = createMonitoringSource(db)
    .list()
    .find((item) => item.id === serviceId);
  const observation = createObservationStore(db)
    .list(now)
    .find((item) => item.id === serviceId);
  const at = observation?.lastAttempt ? Date.parse(observation.lastAttempt) : null;
  const fresh = periodicEvidenceFreshness({
    observedAt: at,
    evaluatedAt: now,
    intervalSeconds: target?.checkInterval ?? CHECK_INTERVAL_DEFAULT,
    usable: !!target && !!observation,
  });
  if (
    fresh !== 'fresh' ||
    at === null ||
    at < window.endsAt ||
    observation?.status === 'unknown' ||
    !observation ||
    ['maintenance', 'unchecked', 'destination-blocked'].includes(observation.reason)
  )
    return { state: 'insufficient' as const, evaluatedAt, observedAt: null };
  return {
    state: observation.status,
    evaluatedAt,
    observedAt: observation.lastAttempt,
    validUntil: new Date(
      at + (target?.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 2_000,
    ).toISOString(),
  };
}
