import type { DatabaseSync } from 'node:sqlite';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A little over 90 days, so the heatmap and the previous 30-day period have data. */
export const ROLLUP_RETENTION = 100 * DAY;

export type HourlyRow = { hour: number; up: number; down: number; unknown: number };

/**
 * Hourly counts of checks per service, fed by every new history row. It outlives the raw history
 * (30 days) so long ranges and period-over-period comparisons keep working. It is independent of
 * the check configuration: editing a service never erases its long-term record.
 */
export function createRollupStore(db: DatabaseSync) {
  const column = { available: 'up', unavailable: 'down' } as const;
  const upserts = {
    up: db.prepare(
      'INSERT INTO service_uptime_rollup(service_id,hour,up) VALUES(?,?,1) ON CONFLICT(service_id,hour) DO UPDATE SET up=up+1',
    ),
    down: db.prepare(
      'INSERT INTO service_uptime_rollup(service_id,hour,down) VALUES(?,?,1) ON CONFLICT(service_id,hour) DO UPDATE SET down=down+1',
    ),
    unknown: db.prepare(
      'INSERT INTO service_uptime_rollup(service_id,hour,unknown) VALUES(?,?,1) ON CONFLICT(service_id,hour) DO UPDATE SET unknown=unknown+1',
    ),
  };
  return {
    /** Counts one new check. Called inside the publish transaction, once per stored history row. */
    record(serviceId: number, observedAt: number, status: string) {
      const key = column[status as keyof typeof column] ?? 'unknown';
      upserts[key].run(serviceId, Math.floor(observedAt / HOUR) * HOUR);
    },
    /** Builds the table from the stored history the first time (never when it already has rows). */
    backfill() {
      const has = db.prepare('SELECT 1 FROM service_uptime_rollup LIMIT 1').get();
      if (has) return 0;
      return Number(
        db
          .prepare(
            `INSERT INTO service_uptime_rollup(service_id,hour,up,down,unknown)
             SELECT h.service_id,(h.observed_at/${HOUR})*${HOUR},
               SUM(h.status='available'),SUM(h.status='unavailable'),
               SUM(h.status IS NOT 'available' AND h.status IS NOT 'unavailable')
             FROM service_observation_history h JOIN monitors s ON s.id=h.service_id
             GROUP BY h.service_id,(h.observed_at/${HOUR})`,
          )
          .run().changes,
      );
    },
    prune(now = Date.now()) {
      db.prepare('DELETE FROM service_uptime_rollup WHERE hour<?').run(now - ROLLUP_RETENTION);
    },
    /** Hourly rows of one service in [from, to). */
    hourly(serviceId: number, from: number, to: number): HourlyRow[] {
      return db
        .prepare(
          'SELECT hour,up,down,unknown FROM service_uptime_rollup WHERE service_id=? AND hour>=? AND hour<? ORDER BY hour',
        )
        .all(serviceId, Math.floor(from / HOUR) * HOUR, to) as HourlyRow[];
    },
    /**
     * Availability of every service in [from, to), as a percentage with two decimals. `null` when
     * there are too few up/down checks to say anything (the same rule as the live percentage).
     */
    uptimePct(from: number, to: number, minChecks = 5): Record<number, number | null> {
      const rows = db
        .prepare(
          'SELECT service_id AS id,SUM(up) AS up,SUM(down) AS down FROM service_uptime_rollup WHERE hour>=? AND hour<? GROUP BY service_id',
        )
        .all(Math.floor(from / HOUR) * HOUR, to) as { id: number; up: number; down: number }[];
      const result: Record<number, number | null> = {};
      for (const row of rows) {
        const counted = row.up + row.down;
        result[row.id] =
          counted >= minChecks ? Math.round((row.up / counted) * 10_000) / 100 : null;
      }
      return result;
    },
  };
}

export type RollupStore = ReturnType<typeof createRollupStore>;
