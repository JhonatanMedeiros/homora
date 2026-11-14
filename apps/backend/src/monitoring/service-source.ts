import type { DatabaseSync } from 'node:sqlite';
import type { Service } from '@homora/shared';

/**
 * A row as SQLite hands it over: booleans arrive as 0/1 integers, so `allowPrivate` and
 * `checkInsecure` are not booleans yet, whatever the type system is told.
 */
type MonitoringRow = Omit<Service, 'allowPrivate' | 'checkInsecure'> & {
  allowPrivate: boolean | number | null;
  checkInsecure: boolean | number | null;
};

const SELECT_TARGETS = `SELECT id,name,url,allow_private AS allowPrivate,check_insecure AS checkInsecure,
  check_type AS checkType,check_interval AS checkInterval,expected_status AS expectedStatus,
  check_path AS checkPath,check_url AS checkUrl,check_match AS checkMatch
  FROM monitor_targets ORDER BY id`;

/**
 * The engine compares `allowPrivate === true`. Casting the raw row to `Service` hides the 0/1
 * and makes every private destination fail as `destination-blocked`, so the conversion happens
 * here, at the boundary, and never by trusting the cast.
 */
export const toMonitoringService = (row: MonitoringRow): Service => ({
  ...row,
  allowPrivate: Boolean(row.allowPrivate),
  checkInsecure: Boolean(row.checkInsecure),
});

/** Every target the engine may check — card or probe — with the flags already coerced. */
export function createMonitoringSource(sqlite: DatabaseSync) {
  const list = (): Service[] =>
    (sqlite.prepare(SELECT_TARGETS).all() as unknown as MonitoringRow[]).map(toMonitoringService);
  return { list };
}
