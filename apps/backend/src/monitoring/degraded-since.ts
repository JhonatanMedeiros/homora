import type { DatabaseSync } from 'node:sqlite';
import { monitoringState } from '@homora/widgets';
import type { MonitoringService } from './service-source.js';
import type { ServiceStatus } from './monitor.js';
import { serviceSignature } from './signature.js';

/** First check observed above the current limit in this process, not an assertion about earlier time. */
export function createDegradedSince(db: DatabaseSync) {
  const entries = new Map<
    number,
    { since: number | null; attemptedAt: number; threshold: number | null; signature: string }
  >();
  return {
    observe(
      services: MonitoringService[],
      states: Record<number, ServiceStatus>,
      now = Date.now(),
    ) {
      const thresholds = new Map(
        (
          db
            .prepare(
              'SELECT service_id AS id, degraded_latency_ms AS threshold FROM service_monitor_settings',
            )
            .all() as { id: number; threshold: number | null }[]
        ).map((row) => [row.id, row.threshold]),
      );
      const active = new Set(services.map((service) => service.id));
      for (const id of entries.keys()) if (!active.has(id)) entries.delete(id);
      for (const service of services) {
        const status = states[service.id];
        const threshold = thresholds.get(service.id) ?? null;
        const attemptedAt = status?.lastAttempt ? Date.parse(status.lastAttempt) : NaN;
        const state = monitoringState({
          status: status?.status,
          reason: status?.reason,
          latencyMs: status?.latencyMs,
          degradedLatencyMs: threshold,
          blocked: false,
        });
        if (!Number.isFinite(attemptedAt) || attemptedAt < 0 || attemptedAt > now) {
          entries.delete(service.id);
          continue;
        }
        const signature = serviceSignature(service);
        const previous = entries.get(service.id);
        const unchanged = previous?.signature === signature && previous.threshold === threshold;
        // A changed limit can reclassify an old sample; do not claim it began before the change was observed.
        const since =
          state === 'degraded'
            ? unchanged && previous.since !== null
              ? previous.since
              : previous &&
                  (previous.threshold !== threshold || previous.attemptedAt === attemptedAt)
                ? now
                : attemptedAt
            : null;
        entries.set(service.id, { since, attemptedAt, threshold, signature });
      }
    },
    since(
      id: number,
      threshold: number | null | undefined,
      attemptedAt: number | null,
    ): number | null {
      const entry = entries.get(id);
      return entry && entry.threshold === (threshold ?? null) && entry.attemptedAt === attemptedAt
        ? entry.since
        : null;
    },
  };
}
