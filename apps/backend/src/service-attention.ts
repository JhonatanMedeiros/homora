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
  const orderKey = 'service_pin_order';
  const order = (): number[] => {
    const row = sqlite.prepare('SELECT value FROM app_settings WHERE key=?').get(orderKey) as
      { value: string } | undefined;
    try {
      const value: unknown = JSON.parse(row?.value ?? '[]');
      if (
        !Array.isArray(value) ||
        !value.every((id) => Number.isSafeInteger(id) && id > 0) ||
        new Set(value).size !== value.length
      )
        return [];
      return value;
    } catch {
      return [];
    }
  };
  const saveOrder = (ids: number[]) =>
    sqlite
      .prepare(
        'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(orderKey, JSON.stringify(ids));
  // Favorites belong to the dashboard card; acknowledgements belong to whatever is monitored, probes included.
  const cardExists = (id: number) =>
    Boolean(sqlite.prepare('SELECT id FROM services WHERE id=?').get(id));
  const exists = (id: number) =>
    Boolean(sqlite.prepare('SELECT id FROM monitors WHERE id=?').get(id));
  return {
    pinnedOrder: order,
    setPinnedOrder(ids: number[]) {
      const current = this.pinnedIds();
      if (
        ids.length !== current.size ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !current.has(id))
      )
        throw new Error('Invalid pin order');
      saveOrder(ids);
    },
    pinnedIds(): Set<number> {
      const rows = sqlite.prepare('SELECT service_id AS id FROM service_pins').all() as {
        id: number;
      }[];
      return new Set(rows.map((row) => row.id));
    },
    /** Returns false when the service does not exist. */
    setPinned(id: number, pinned: boolean): boolean {
      sqlite.exec('SAVEPOINT pin_change');
      try {
        if (!cardExists(id)) {
          sqlite.exec('RELEASE pin_change');
          return false;
        }
        const wasPinned = this.pinnedIds().has(id);
        if (pinned)
          sqlite
            .prepare('INSERT OR IGNORE INTO service_pins(service_id,pinned_at) VALUES(?,?)')
            .run(id, now());
        else sqlite.prepare('DELETE FROM service_pins WHERE service_id=?').run(id);
        if (wasPinned !== pinned) saveOrder(order().filter((item) => item !== id));
        sqlite.exec('RELEASE pin_change');
        return true;
      } catch (error) {
        sqlite.exec('ROLLBACK TO pin_change; RELEASE pin_change');
        throw error;
      }
    },
    /** Marks pinned services (used by import); unknown ids are ignored. */
    replacePinned(ids: number[]) {
      sqlite.prepare('DELETE FROM service_pins').run();
      const insert = sqlite.prepare(
        'INSERT OR IGNORE INTO service_pins(service_id,pinned_at) SELECT id,? FROM services WHERE id=?',
      );
      for (const id of ids) insert.run(now(), id);
      saveOrder([]);
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
