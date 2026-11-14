import type { DatabaseSync } from 'node:sqlite';

export type Acknowledgement = {
  incidentId: number | null;
  acknowledgedAt: number;
  mutedUntil: number | null;
};

type AckRow = Acknowledgement & { serviceId: number };

/**
 * What a person marked on a service from the Home: favorites, and "I saw this" (acknowledge) or a
 * timed mute. None of it changes how a service is checked or when notifications go out.
 */
export function createServiceAttention(sqlite: DatabaseSync, now: () => number = Date.now) {
  // Favorites belong to the dashboard card; acknowledgements belong to whatever is monitored, probes included.
  const cardExists = (id: number) =>
    Boolean(sqlite.prepare('SELECT id FROM services WHERE id=?').get(id));
  const exists = (id: number) =>
    Boolean(sqlite.prepare('SELECT id FROM monitors WHERE id=?').get(id));
  return {
    pinnedIds(): Set<number> {
      const rows = sqlite.prepare('SELECT service_id AS id FROM service_pins').all() as {
        id: number;
      }[];
      return new Set(rows.map((row) => row.id));
    },
    /** Returns false when the service does not exist. */
    setPinned(id: number, pinned: boolean): boolean {
      if (!cardExists(id)) return false;
      if (pinned)
        sqlite
          .prepare('INSERT OR IGNORE INTO service_pins(service_id,pinned_at) VALUES(?,?)')
          .run(id, now());
      else sqlite.prepare('DELETE FROM service_pins WHERE service_id=?').run(id);
      return true;
    },
    /** Marks pinned services (used by import); unknown ids are ignored. */
    replacePinned(ids: number[]) {
      sqlite.prepare('DELETE FROM service_pins').run();
      const insert = sqlite.prepare(
        'INSERT OR IGNORE INTO service_pins(service_id,pinned_at) SELECT id,? FROM services WHERE id=?',
      );
      for (const id of ids) insert.run(now(), id);
    },
    list(): Record<number, Acknowledgement> {
      const rows = sqlite
        .prepare(
          'SELECT service_id AS serviceId, incident_id AS incidentId, acknowledged_at AS acknowledgedAt, muted_until AS mutedUntil FROM service_acknowledgements',
        )
        .all() as unknown as AckRow[];
      const at = now();
      const result: Record<number, Acknowledgement> = {};
      for (const { serviceId, ...rest } of rows) {
        // A mute that already lapsed is gone for every reader; the row is cleaned on the next write.
        if (rest.mutedUntil !== null && rest.mutedUntil <= at && rest.incidentId === null) continue;
        result[serviceId] = rest;
      }
      return result;
    },
    /** Acknowledge the incident the person saw (null when none is known), optionally muting for a while. */
    acknowledge(
      id: number,
      incidentId: number | null,
      muteMinutes?: number,
    ): Acknowledgement | null {
      if (!exists(id)) return null;
      const at = now();
      const mutedUntil = muteMinutes ? at + muteMinutes * 60_000 : null;
      sqlite
        .prepare(
          `INSERT INTO service_acknowledgements(service_id,incident_id,acknowledged_at,muted_until) VALUES(?,?,?,?)
           ON CONFLICT(service_id) DO UPDATE SET incident_id=excluded.incident_id,acknowledged_at=excluded.acknowledged_at,muted_until=excluded.muted_until`,
        )
        .run(id, incidentId, at, mutedUntil);
      return { incidentId, acknowledgedAt: at, mutedUntil };
    },
    /** Removes the mark; returns false when the service does not exist. */
    clear(id: number): boolean {
      if (!exists(id)) return false;
      sqlite.prepare('DELETE FROM service_acknowledgements WHERE service_id=?').run(id);
      return true;
    },
  };
}
