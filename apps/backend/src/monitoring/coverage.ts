import type { DatabaseSync } from 'node:sqlite';
import { CHECK_INTERVAL_DEFAULT, periodicEvidenceFreshness } from '@homora/shared';
import { createMonitoringSource } from './service-source.js';
import { createObservationStore } from './observations.js';

/** Assess only facts supported by the current monitor configuration and observation. */
export function monitoringCoverage(db: DatabaseSync, now = Date.now()) {
  const targets = createMonitoringSource(db).list();
  const observations = new Map(
    createObservationStore(db)
      .list(now)
      .map((item) => [item.id, item]),
  );
  const services = new Set(
    (db.prepare('SELECT id FROM services').all() as { id: number }[]).map((row) => row.id),
  );
  const items = targets.flatMap((target) => {
    const observation = observations.get(target.id);
    const observedAt = observation?.lastAttempt ?? null;
    const freshness = periodicEvidenceFreshness({
      observedAt: observedAt ? Date.parse(observedAt) : null,
      evaluatedAt: now,
      intervalSeconds: target.checkInterval ?? CHECK_INTERVAL_DEFAULT,
      usable: !!observation,
    });
    const reason =
      !target.checkUrl && !target.url
        ? 'missing-target'
        : freshness === 'stale'
          ? 'stale'
          : freshness !== 'fresh' || observation?.reason === 'unchecked'
            ? 'unknown'
            : observation?.reason === 'destination-blocked'
              ? 'blocked'
              : observation?.reason === 'maintenance'
                ? 'maintenance'
                : null;
    if (!reason) return [];
    const isService = services.has(target.id);
    return [
      {
        id: target.id,
        kind: isService ? ('service' as const) : ('probe' as const),
        reason,
        observedAt: reason === 'missing-target' ? null : observedAt,
        link: isService ? `/manage/services/${target.id}/edit` : '/manage/probes',
      },
    ];
  });
  return {
    evaluatedAt: new Date(now).toISOString(),
    total: targets.length,
    truncated: items.length > 100,
    items: items.slice(0, 100),
  };
}
