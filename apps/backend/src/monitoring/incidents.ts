import type { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_MONITOR_SETTINGS,
  SLA_TARGET_DEFAULT,
  type Incident,
  type MonitorSettings,
  type Service,
  type StatusOverview,
  type UptimeSummary,
} from '@homora/shared';
import type { ServiceStatus } from './monitor.js';
import { serviceSignature } from './signature.js';

const DAY = 24 * 3_600_000;
const SLA_KEY = 'sla_target_pct';
const OVERVIEW_CACHE_MS = 10_000;

type Row = {
  id: number;
  serviceId: number;
  startedAt: number;
  endedAt: number | null;
  reason: string;
  httpStatus: number | null;
  failedChecks: number;
};
const toIncident = (row: Row): Incident => ({ ...row });
const COLUMNS =
  'id,service_id AS serviceId,started_at AS startedAt,ended_at AS endedAt,reason,http_status AS httpStatus,failed_checks AS failedChecks';

/** Where a service is within the run of checks that may become, or end, an incident. */
type Streak = {
  fails: number;
  oks: number;
  startedAt: number | null;
  firstOkAt: number | null;
  reason: string;
  httpStatus: number | null;
  lastAt: number;
  incidentId: number | null;
};
const fresh = (): Streak => ({
  fails: 0,
  oks: 0,
  startedAt: null,
  firstOkAt: null,
  reason: 'no-response',
  httpStatus: null,
  lastAt: 0,
  incidentId: null,
});

/**
 * Incidents are periods of consecutive failed checks. One opens when a service fails
 * `failureThreshold` times in a row (so isolated failures stay in the history without becoming
 * incidents) and closes after `recoveryThreshold` successful checks in a row; `unknown` checks
 * change nothing. Everything is derived from the monitor's own observations.
 */
export function createIncidentStore(db: DatabaseSync) {
  const streaks = new Map<number, Streak>();
  let overviewCache: { at: number; body: StatusOverview } | null = null;

  const readSettings = () => {
    const map = new Map<number, MonitorSettings>();
    for (const r of db
      .prepare(
        'SELECT service_id AS id,failure_threshold AS f,recovery_threshold AS r,degraded_latency_ms AS d FROM service_monitor_settings',
      )
      .all() as { id: number; f: number; r: number; d: number | null }[])
      map.set(r.id, { failureThreshold: r.f, recoveryThreshold: r.r, degradedLatencyMs: r.d });
    return map;
  };

  const insert = db.prepare(
    'INSERT INTO service_incidents(service_id,started_at,reason,http_status,failed_checks) VALUES(?,?,?,?,?)',
  );
  const progress = db.prepare(
    'UPDATE service_incidents SET failed_checks=?,reason=?,http_status=? WHERE id=?',
  );
  const close = db.prepare('UPDATE service_incidents SET ended_at=? WHERE id=?');
  const openOf = db.prepare(
    `SELECT ${COLUMNS} FROM service_incidents WHERE service_id=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
  );

  /** Streak of a service, resumed from its open incident after a restart. */
  function streakOf(serviceId: number): Streak {
    let streak = streaks.get(serviceId);
    if (streak) return streak;
    streak = fresh();
    const open = openOf.get(serviceId) as Row | undefined;
    if (open) {
      streak.incidentId = open.id;
      streak.fails = open.failedChecks;
      streak.startedAt = open.startedAt;
      streak.reason = open.reason;
      streak.httpStatus = open.httpStatus;
    }
    streaks.set(serviceId, streak);
    return streak;
  }

  /** Feeds one check into the state machine; returns true when an incident opened or closed. */
  function apply(
    serviceId: number,
    streak: Streak,
    at: number,
    status: 'available' | 'unavailable',
    reason: string,
    httpStatus: number | null,
    settings: MonitorSettings,
  ) {
    streak.lastAt = at;
    if (status === 'unavailable') {
      if (streak.fails === 0) streak.startedAt = at;
      streak.fails++;
      streak.oks = 0;
      streak.firstOkAt = null;
      streak.reason = reason;
      streak.httpStatus = httpStatus;
      if (streak.incidentId !== null) {
        progress.run(streak.fails, reason, httpStatus, streak.incidentId);
        return false;
      }
      if (streak.fails >= settings.failureThreshold) {
        const created = insert.run(
          serviceId,
          streak.startedAt ?? at,
          reason,
          httpStatus,
          streak.fails,
        );
        streak.incidentId = Number(created.lastInsertRowid);
        return true;
      }
      return false;
    }
    if (streak.incidentId === null) {
      // A pending streak that never reached the threshold was only noise.
      Object.assign(streak, fresh(), { lastAt: at });
      return false;
    }
    streak.oks++;
    streak.firstOkAt ??= at;
    if (streak.oks >= settings.recoveryThreshold) {
      close.run(streak.firstOkAt, streak.incidentId);
      Object.assign(streak, fresh(), { lastAt: at });
      return true;
    }
    return false;
  }

  return {
    /** Called with every monitor publication; only checks newer than the last one seen count. */
    observe(services: Service[], states: Record<number, ServiceStatus>) {
      if (!services.length) return;
      const settings = readSettings();
      const ids = new Set(services.map(({ id }) => id));
      for (const id of streaks.keys()) if (!ids.has(id)) streaks.delete(id);
      let changed = false;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const service of services) {
          const state = states[service.id];
          if (!state?.lastAttempt || state.status === 'unknown') continue;
          const at = Date.parse(state.lastAttempt);
          const streak = streakOf(service.id);
          if (at <= streak.lastAt) continue;
          if (
            apply(
              service.id,
              streak,
              at,
              state.status,
              state.reason,
              state.httpStatus,
              settings.get(service.id) ?? DEFAULT_MONITOR_SETTINGS,
            )
          )
            changed = true;
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        streaks.clear();
        throw error;
      }
      if (changed) overviewCache = null;
    },

    /**
     * Builds incidents from the stored checks. Runs once at start-up while no incident exists, so
     * the failures already in the history show up the first time this feature is used. Only
     * checks made under each service's current configuration count, like the uptime does.
     */
    rebuildFromHistory(services: Service[]) {
      const existing = db.prepare('SELECT 1 FROM service_incidents LIMIT 1').get();
      if (existing) return 0;
      const settings = readSettings();
      const rows = db.prepare(
        `SELECT observed_at AS at,status,json_extract(observation,'$.reason') AS reason,json_extract(observation,'$.httpStatus') AS httpStatus
         FROM service_observation_history WHERE service_id=? AND signature=? AND status IN ('available','unavailable') ORDER BY observed_at`,
      );
      let opened = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const service of services) {
          const streak = fresh();
          const config = settings.get(service.id) ?? DEFAULT_MONITOR_SETTINGS;
          for (const row of rows.all(service.id, serviceSignature(service)) as {
            at: number;
            status: 'available' | 'unavailable';
            reason: string | null;
            httpStatus: number | null;
          }[])
            if (
              apply(
                service.id,
                streak,
                row.at,
                row.status,
                row.reason ?? 'no-response',
                row.httpStatus,
                config,
              ) &&
              row.status === 'unavailable'
            )
              opened++;
          // Live observation resumes from here, never counting an old check twice.
          if (streak.lastAt) streaks.set(service.id, streak);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        streaks.clear();
        throw error;
      }
      return opened;
    },

    list(serviceId: number, limit = 20, before?: number) {
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM service_incidents WHERE service_id=? AND (? IS NULL OR id<?) ORDER BY id DESC LIMIT ?`,
        )
        .all(serviceId, before ?? null, before ?? null, limit + 1) as Row[];
      const incidents = rows.slice(0, limit).map(toIncident);
      return { incidents, nextBefore: rows.length > limit ? (incidents.at(-1)?.id ?? null) : null };
    },

    open(): Record<number, Incident> {
      const result: Record<number, Incident> = {};
      for (const row of db
        .prepare(`SELECT ${COLUMNS} FROM service_incidents WHERE ended_at IS NULL ORDER BY id`)
        .all() as Row[])
        result[row.serviceId] = toIncident(row);
      return result;
    },

    slaTarget(): number {
      const row = db.prepare('SELECT value FROM app_settings WHERE key=?').get(SLA_KEY) as
        { value: string } | undefined;
      const value = Number(row?.value);
      return Number.isFinite(value) && value >= 90 && value < 100 ? value : SLA_TARGET_DEFAULT;
    },
    setSlaTarget(value: number) {
      db.prepare(
        'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ).run(SLA_KEY, String(value));
      overviewCache = null;
    },

    serviceExists(serviceId: number) {
      return db.prepare('SELECT 1 FROM monitors WHERE id=?').get(serviceId) !== undefined;
    },
    settingsOf(serviceId: number): MonitorSettings {
      return readSettings().get(serviceId) ?? DEFAULT_MONITOR_SETTINGS;
    },
    /** Replaces the settings of a service; the defaults are stored as the absence of a row. */
    setSettings(serviceId: number, value: MonitorSettings) {
      const isDefault =
        value.failureThreshold === DEFAULT_MONITOR_SETTINGS.failureThreshold &&
        value.recoveryThreshold === DEFAULT_MONITOR_SETTINGS.recoveryThreshold &&
        value.degradedLatencyMs === DEFAULT_MONITOR_SETTINGS.degradedLatencyMs;
      if (isDefault)
        db.prepare('DELETE FROM service_monitor_settings WHERE service_id=?').run(serviceId);
      else
        db.prepare(
          `INSERT INTO service_monitor_settings(service_id,failure_threshold,recovery_threshold,degraded_latency_ms) VALUES(?,?,?,?)
           ON CONFLICT(service_id) DO UPDATE SET failure_threshold=excluded.failure_threshold,recovery_threshold=excluded.recovery_threshold,degraded_latency_ms=excluded.degraded_latency_ms`,
        ).run(serviceId, value.failureThreshold, value.recoveryThreshold, value.degradedLatencyMs);
      overviewCache = null;
    },

    /**
     * Numbers for the dashboard banner. `uptime30d` supplies the 30-day summary of every service,
     * so the SLA agrees with the cards; it is only called when the cached result is stale. Any
     * incident or settings change drops the cache.
     */
    overview(uptime30d: () => Record<number, UptimeSummary>, now = Date.now()): StatusOverview {
      if (overviewCache && now - overviewCache.at < OVERVIEW_CACHE_MS) return overviewCache.body;
      const count = (from: number, to: number) =>
        (
          db
            .prepare(
              'SELECT COUNT(*) AS n FROM service_incidents WHERE started_at>=? AND started_at<?',
            )
            .get(from, to) as { n: number }
        ).n;
      const mttr = db
        .prepare(
          'SELECT AVG(ended_at-started_at) AS ms FROM service_incidents WHERE ended_at IS NOT NULL AND ended_at>=?',
        )
        .get(now - 30 * DAY) as { ms: number | null };
      // The clean stretch cannot be longer than the time Homora has been watching.
      const first = (
        db.prepare('SELECT MIN(observed_at) AS at FROM service_observation_history').get() as {
          at: number | null;
        }
      ).at;
      const windowStart = Math.max(now - 30 * DAY, first ?? now);
      const spans = db
        .prepare(
          'SELECT started_at AS s,COALESCE(ended_at,?) AS e FROM service_incidents WHERE COALESCE(ended_at,?)>=? ORDER BY started_at',
        )
        .all(now, now, windowStart) as { s: number; e: number }[];
      let longest = 0;
      let cursor = windowStart;
      for (const span of spans) {
        longest = Math.max(longest, span.s - cursor);
        cursor = Math.max(cursor, span.e);
      }
      longest = Math.max(longest, now - cursor);
      let up = 0;
      let down = 0;
      for (const summary of Object.values(uptime30d())) {
        down += summary.downChecks;
        up += summary.checks - summary.downChecks - summary.unknownChecks;
      }
      const settings: StatusOverview['settings'] = {};
      for (const [id, value] of readSettings()) settings[id] = value;
      const body: StatusOverview = {
        generatedAt: new Date(now).toISOString(),
        settings,
        open: this.open(),
        incidents7d: count(now - 7 * DAY, now + 1),
        incidentsPrevious7d: count(now - 14 * DAY, now - 7 * DAY),
        mttrMs: mttr.ms === null ? null : Math.round(mttr.ms),
        longestCleanMs: Math.max(0, Math.round(longest)),
        sla: {
          targetPct: this.slaTarget(),
          actualPct: up + down >= 5 ? Math.round((up / (up + down)) * 10_000) / 100 : null,
        },
      };
      overviewCache = { at: now, body };
      return body;
    },
  };
}
