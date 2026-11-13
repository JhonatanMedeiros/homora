import type { DatabaseSync } from 'node:sqlite';
import { MAINTENANCE_MAX_MS, MAINTENANCE_MIN_MS, type Maintenance } from '@homora/shared';

/** Past windows are kept this long so the service page can say what happened. */
const KEEP_PAST_MS = 30 * 24 * 3_600_000;
const COLUMNS = 'id,service_id AS serviceId,starts_at AS startsAt,ends_at AS endsAt,note';

export class MaintenanceError extends Error {
  constructor(readonly code: 'invalid-window' | 'service-not-found' | 'overlap') {
    super(code);
  }
}

/** Scheduled maintenance: while a window is open the monitor does not probe the service. */
export function createMaintenanceStore(db: DatabaseSync) {
  const listOf = (serviceId: number | null, since: number) =>
    db
      .prepare(
        `SELECT ${COLUMNS} FROM service_maintenance WHERE ends_at>=? AND (? IS NULL OR service_id=?) ORDER BY starts_at,id`,
      )
      .all(since, serviceId, serviceId) as unknown as Maintenance[];
  return {
    /** Windows that are open now or still ahead, for every service or just one. */
    upcoming(now = Date.now(), serviceId: number | null = null) {
      return listOf(serviceId, now);
    },
    /** Open now, plus recent history, for the service page. */
    ofService(serviceId: number, now = Date.now()) {
      return listOf(serviceId, now - KEEP_PAST_MS);
    },
    /** The window each service is in at `now` (the latest to end wins when they overlap). */
    active(now = Date.now()): Map<number, Maintenance> {
      const result = new Map<number, Maintenance>();
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM service_maintenance WHERE starts_at<=? AND ends_at>? ORDER BY ends_at`,
        )
        .all(now, now) as unknown as Maintenance[];
      for (const row of rows) result.set(row.serviceId, row);
      return result;
    },
    create(
      serviceId: number,
      window: { startsAt: number; endsAt: number; note: string },
      now = Date.now(),
    ): Maintenance {
      const length = window.endsAt - window.startsAt;
      if (
        !Number.isSafeInteger(window.startsAt) ||
        !Number.isSafeInteger(window.endsAt) ||
        length < MAINTENANCE_MIN_MS ||
        length > MAINTENANCE_MAX_MS ||
        window.endsAt <= now
      )
        throw new MaintenanceError('invalid-window');
      if (!db.prepare('SELECT 1 FROM services WHERE id=?').get(serviceId))
        throw new MaintenanceError('service-not-found');
      if (
        db
          .prepare(
            'SELECT 1 FROM service_maintenance WHERE service_id=? AND starts_at<? AND ends_at>?',
          )
          .get(serviceId, window.endsAt, window.startsAt)
      )
        throw new MaintenanceError('overlap');
      db.prepare('DELETE FROM service_maintenance WHERE ends_at<?').run(now - KEEP_PAST_MS);
      const created = db
        .prepare(
          'INSERT INTO service_maintenance(service_id,starts_at,ends_at,note) VALUES(?,?,?,?)',
        )
        .run(serviceId, window.startsAt, window.endsAt, window.note);
      return { id: Number(created.lastInsertRowid), serviceId, ...window };
    },
    /** Removes a window; one that already ran is history and stays, an open one ends now. */
    remove(id: number, now = Date.now()): Maintenance | null {
      const row = db
        .prepare(`SELECT ${COLUMNS} FROM service_maintenance WHERE id=?`)
        .get(id) as unknown as Maintenance | undefined;
      if (!row) return null;
      if (row.endsAt <= now) return row;
      if (row.startsAt <= now)
        db.prepare('UPDATE service_maintenance SET ends_at=? WHERE id=?').run(now, id);
      else db.prepare('DELETE FROM service_maintenance WHERE id=?').run(id);
      return row;
    },
  };
}
