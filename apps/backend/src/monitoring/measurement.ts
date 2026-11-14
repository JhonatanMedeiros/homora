import type { DatabaseSync } from 'node:sqlite';
import type { Service } from '@homora/shared';
import type { ServiceStatus } from './monitor.js';

/** Fewer measured monitors than this cannot tell a broken measurer from broken services. */
export const MEASUREMENT_MIN_MONITORS = 4;
/** Share of measured monitors that must fail for the same reason. */
export const MEASUREMENT_SHARE = 0.8;
/** Consecutive cycles that must agree before the failure is declared the measurer's. */
export const MEASUREMENT_CYCLES = 2;

export type MeasurementIncident = {
  id: number;
  startedAt: number;
  endedAt: number | null;
  reason: string;
  failing: number;
  measured: number;
  monitors: { id: number; name: string; reason: string }[];
};

export type MeasurementTransition = {
  kind: 'down' | 'up';
  incident: MeasurementIncident;
  at: number;
};

type Row = Omit<MeasurementIncident, 'monitors'> & { monitors: string };
const COLUMNS = 'id,started_at AS startedAt,ended_at AS endedAt,reason,failing,measured,monitors';
const toIncident = (row: Row): MeasurementIncident => {
  let monitors: MeasurementIncident['monitors'] = [];
  try {
    const parsed: unknown = JSON.parse(row.monitors);
    if (Array.isArray(parsed)) monitors = parsed as MeasurementIncident['monitors'];
  } catch {
    // An unreadable list only loses detail; the incident itself stays.
  }
  return { ...row, monitors };
};

/**
 * Tells "the service does not answer" from "the monitor could not measure". When at least 80% of
 * the measured monitors (and at least four of them) fail with the same reason, the cause is most
 * likely the measurer (DNS, network policy, a bug), not the services.
 *
 * The first such cycle is only held back and the second one confirms it, so a real outage that is
 * not widespread is delayed by at most one cycle and a measurement failure never opens N incidents.
 * Confirmed failures are stored as one global incident. While one is active, the monitors that
 * share the reason are masked as `unknown` for incidents and notifications; monitors failing for
 * another reason keep opening their own. Recovery needs no hysteresis: the first cycle that is no
 * longer widespread closes the incident, and checks made while masked are never counted later.
 */
export function createMeasurementGuard(
  db: DatabaseSync,
  onTransition?: (transition: MeasurementTransition) => void,
) {
  const insert = db.prepare(
    'INSERT INTO measurement_incidents(started_at,reason,failing,measured,monitors) VALUES(?,?,?,?,?)',
  );
  const update = db.prepare(
    'UPDATE measurement_incidents SET reason=?,failing=?,measured=?,monitors=? WHERE id=?',
  );
  const close = db.prepare('UPDATE measurement_incidents SET ended_at=? WHERE id=?');
  const openRow = db.prepare(
    `SELECT ${COLUMNS} FROM measurement_incidents WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1`,
  );

  let pending: { reason: string; cycles: number } | null = null;
  /** The reason being masked right now: a held-back cycle or a confirmed incident. */
  let masking: string | null = null;
  /** Newest check seen per masked monitor; checks at or before it never reach incidents. */
  const floors = new Map<number, string>();
  let lastCycle = '';
  let open: MeasurementIncident | null = null;
  try {
    const row = openRow.get() as Row | undefined;
    open = row ? toIncident(row) : null;
  } catch {
    open = null;
  }
  // After a restart the confirmed incident is still real, but the evidence has to come back.
  if (open) masking = open.reason;

  return {
    /** The confirmed measurement incident in progress, if any. */
    current(): MeasurementIncident | null {
      return open;
    },

    /** Feeds one publication of the monitor; only a publication with newer checks is a cycle. */
    observe(
      services: Pick<Service, 'id' | 'name'>[],
      states: Record<number, ServiceStatus>,
      at = Date.now(),
    ) {
      if (!services.length) return;
      let newest = '';
      const byReason = new Map<string, { id: number; name: string }[]>();
      let measured = 0;
      for (const service of services) {
        const state = states[service.id];
        if (!state?.lastAttempt || state.status === 'unknown') continue;
        if (state.lastAttempt > newest) newest = state.lastAttempt;
        measured++;
        if (state.status !== 'unavailable') continue;
        const group = byReason.get(state.reason) ?? [];
        group.push({ id: service.id, name: service.name });
        byReason.set(state.reason, group);
      }
      if (newest === lastCycle) return;
      lastCycle = newest;
      const [reason, failing] = [...byReason.entries()].sort(
        (a, b) => b[1].length - a[1].length,
      )[0] ?? ['', []];
      const widespread =
        measured >= MEASUREMENT_MIN_MONITORS && failing.length >= measured * MEASUREMENT_SHARE;
      const ids = new Set(services.map(({ id }) => id));
      for (const id of floors.keys()) if (!ids.has(id)) floors.delete(id);

      if (!widespread) {
        pending = null;
        masking = null;
        if (open) {
          close.run(at, open.id);
          const closed = { ...open, endedAt: at };
          open = null;
          onTransition?.({ kind: 'up', incident: closed, at });
        }
        return;
      }

      masking = reason;
      for (const { id } of failing) {
        const attempt = states[id]?.lastAttempt;
        if (attempt) floors.set(id, attempt);
      }
      const monitors = failing.map(({ id, name }) => ({ id, name, reason }));
      if (open) {
        // Same incident, newer picture: the set of failing monitors and the reason may drift.
        open = { ...open, reason, failing: failing.length, measured, monitors };
        update.run(reason, failing.length, measured, JSON.stringify(monitors), open.id);
        return;
      }
      pending =
        pending?.reason === reason ? { reason, cycles: pending.cycles + 1 } : { reason, cycles: 1 };
      if (pending.cycles < MEASUREMENT_CYCLES) return;
      const created = insert.run(at, reason, failing.length, measured, JSON.stringify(monitors));
      open = {
        id: Number(created.lastInsertRowid),
        startedAt: at,
        endedAt: null,
        reason,
        failing: failing.length,
        measured,
        monitors,
      };
      onTransition?.({ kind: 'down', incident: open, at });
    },

    /**
     * States as incidents and notifications should see them: checks that belong to a measurement
     * failure (or were made while one was active) become `unknown`, so they change nothing.
     */
    mask(states: Record<number, ServiceStatus>): Record<number, ServiceStatus> {
      const result: Record<number, ServiceStatus> = {};
      for (const [key, state] of Object.entries(states)) {
        const id = Number(key);
        const floor = floors.get(id);
        const held =
          state.status === 'unavailable' &&
          ((masking !== null && state.reason === masking) ||
            (floor !== undefined && state.lastAttempt !== null && state.lastAttempt <= floor));
        result[id] = held ? { ...state, status: 'unknown' } : state;
      }
      return result;
    },
  };
}
