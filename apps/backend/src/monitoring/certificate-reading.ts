import type { DatabaseSync } from 'node:sqlite';
import type { MonitoringService } from './service-source.js';
import { serviceSignature } from './signature.js';
import { HISTORY_RETENTION } from './uptime.js';
import { CHECK_INTERVAL_DEFAULT } from '@homora/shared';

type CertificateReading = {
  expiresAt: number | null;
  observedAt: number | null;
  stale: boolean;
};

/** Read only observations belonging to the current TLS configuration, never probing a target. */
export function certificateReading(
  db: DatabaseSync,
  service: MonitoringService,
  now: number,
  caHash?: string,
): CertificateReading {
  const unknown: CertificateReading = { expiresAt: null, observedAt: null, stale: false };
  if (service.checkType !== 'tls') return unknown;
  const signature = serviceSignature(service, caHash);
  const rows = db
    .prepare(
      `SELECT observed_at AS observedAt,
        CASE WHEN json_valid(observation) THEN CASE WHEN json_type(observation, '$.certExpiresAt') IN ('integer', 'real') THEN json_extract(observation, '$.certExpiresAt') END END AS expiresAt
       FROM service_observation_history
       WHERE service_id = ? AND signature = ? AND observed_at >= ? AND observed_at <= ?
       ORDER BY observed_at DESC`,
    )
    .iterate(service.id, signature, now - HISTORY_RETENTION, now) as Iterable<{
    observedAt: number;
    expiresAt: unknown;
  }>;
  let latest: number | null = null;
  for (const row of rows) {
    latest ??= row.observedAt;
    if (
      typeof row.expiresAt === 'number' &&
      Number.isSafeInteger(row.expiresAt) &&
      row.expiresAt > 0 &&
      row.expiresAt <= 8_640_000_000_000_000
    )
      return {
        expiresAt: row.expiresAt,
        observedAt: row.observedAt,
        stale:
          row.observedAt !== latest ||
          now - row.observedAt >
            Math.max(120_000, (service.checkInterval ?? CHECK_INTERVAL_DEFAULT) * 2_000),
      };
  }
  return unknown;
}
