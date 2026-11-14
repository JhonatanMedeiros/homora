import type { DatabaseSync } from 'node:sqlite';
import type { IncidentTransition } from './monitoring/index.js';

const RETENTION_MS = 90 * 24 * 60 * 60_000;
const MAX_ITEMS = 10_000;

type InboxRow = {
  id: number;
  serviceId: number | null;
  incidentId: number | null;
  kind: 'down' | 'up';
  serviceName: string;
  confirmedAt: number;
  startedAt: number;
  endedAt: number | null;
  reason: string | null;
  httpStatus: number | null;
  readAt: number | null;
  probe: number;
};

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
        SELECT monitors.id, ?, ?, monitors.name, ?, ?, ?, ?, ? FROM monitors WHERE monitors.id = ?`,
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
          `SELECT n.id, n.service_id AS serviceId, n.incident_id AS incidentId,
        n.kind, n.service_name AS serviceName, n.confirmed_at AS confirmedAt, n.started_at AS startedAt,
        n.ended_at AS endedAt, n.reason, n.http_status AS httpStatus, n.read_at AS readAt,
        (n.service_id IS NOT NULL AND services.id IS NULL) AS probe
        FROM inbox_notifications n LEFT JOIN services ON services.id = n.service_id
        WHERE (? IS NULL OR (n.confirmed_at, n.id) <
          (SELECT confirmed_at, id FROM inbox_notifications WHERE id = ?))
        ORDER BY n.confirmed_at DESC, n.id DESC LIMIT ?`,
        )
        .all(before ?? null, before ?? null, limit + 1) as InboxRow[];
      const items = rows.slice(0, limit).map((row) => ({ ...row, probe: Boolean(row.probe) }));
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
