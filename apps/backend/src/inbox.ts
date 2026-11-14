import type { DatabaseSync } from 'node:sqlite';
import type { IncidentTransition } from './monitoring/index.js';

const RETENTION_MS = 90 * 24 * 60 * 60_000;
const MAX_ITEMS = 10_000;

/** The caller records transitions inside the incident transaction. */
export function createInbox(db: DatabaseSync) {
  function prune(now = Date.now()) {
    db.prepare('DELETE FROM inbox_notifications WHERE confirmed_at < ?').run(now - RETENTION_MS);
    db.prepare(
      `DELETE FROM inbox_notifications WHERE id IN (
      SELECT id FROM inbox_notifications ORDER BY confirmed_at DESC, id DESC LIMIT -1 OFFSET ?
    )`,
    ).run(MAX_ITEMS);
  }
  return {
    prune,
    record(event: IncidentTransition) {
      const inserted = db
        .prepare(
          `INSERT OR IGNORE INTO inbox_notifications
        (service_id, incident_id, kind, service_name, confirmed_at, started_at, ended_at, reason, http_status)
        SELECT services.id, ?, ?, monitors.name, ?, ?, ?, ?, ? FROM services
        JOIN monitors ON monitors.id = services.id WHERE services.id = ?`,
        )
        .run(
          event.incidentId,
          event.kind,
          event.confirmedAt,
          event.startedAt,
          event.endedAt,
          event.reason,
          event.httpStatus,
          event.serviceId,
        );
      if (inserted.changes) prune();
    },
    list(limit: number, before?: number) {
      prune();
      const rows = db
        .prepare(
          `SELECT id, service_id AS serviceId, incident_id AS incidentId,
        kind, service_name AS serviceName, confirmed_at AS confirmedAt, started_at AS startedAt,
        ended_at AS endedAt, reason, http_status AS httpStatus, read_at AS readAt
        FROM inbox_notifications WHERE (? IS NULL OR (confirmed_at, id) <
          (SELECT confirmed_at, id FROM inbox_notifications WHERE id = ?))
        ORDER BY confirmed_at DESC, id DESC LIMIT ?`,
        )
        .all(before ?? null, before ?? null, limit + 1);
      const items = rows.slice(0, limit);
      return {
        items,
        nextBefore: rows.length > limit ? items.at(-1)?.id : null,
        unread: (
          db
            .prepare('SELECT count(*) AS count FROM inbox_notifications WHERE read_at IS NULL')
            .get() as { count: number }
        ).count,
      };
    },
    read(id: number) {
      return (
        db
          .prepare('UPDATE inbox_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?')
          .run(Date.now(), id).changes > 0
      );
    },
    readAll() {
      db.prepare('UPDATE inbox_notifications SET read_at = ? WHERE read_at IS NULL').run(
        Date.now(),
      );
    },
  };
}
