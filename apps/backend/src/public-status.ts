import type { DatabaseSync } from 'node:sqlite';
import { PROBES_GROUP } from '@homora/shared';
import type { createObservationStore } from './monitoring/index.js';

type Observations = ReturnType<typeof createObservationStore>;
export type PublicState = 'up' | 'down' | 'unknown';
export const PUBLIC_NAME_MAX = 60;
export const PUBLIC_DESCRIPTION_MAX = 160;
const ENABLED_KEY = 'public_status_enabled';
const TITLE_KEY = 'public_status_title';
const DESCRIPTION_KEY = 'public_status_description';
const CACHE_MS = 15_000;
const BAR_COUNT = 24;
const BAR_MS = 60 * 60_000;
const DAY_MS = 24 * BAR_MS;
export const PUBLIC_DAYS = 90;
const INCIDENT_WINDOW_MS = 30 * DAY_MS;
const INCIDENT_LIMIT = 20;

/** The one place `monitors.is_public` is written: the UI route and approved proposals both use it. */
export function setMonitorPublic(sqlite: DatabaseSync, id: number, isPublic: boolean) {
  return (
    sqlite.prepare('UPDATE monitors SET is_public=? WHERE id=?').run(isPublic ? 1 : 0, id).changes >
    0
  );
}

/**
 * Opt-in public status page. The payload is deliberately minimal: name, category, a coarse
 * state, a last-checked time, hourly bars, 90 daily bars, and when incidents and maintenance
 * happened. Never URLs, descriptions, addresses, latency, HTTP codes, failure reasons, maintenance
 * notes or internal ids.
 */
export function createPublicStatus(sqlite: DatabaseSync, observations: Observations) {
  const getSetting = (key: string) =>
    (
      sqlite.prepare('SELECT value FROM app_settings WHERE key=?').get(key) as
        { value: string } | undefined
    )?.value;
  const setSetting = (key: string, value: string) =>
    sqlite
      .prepare(
        'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, value);
  let cache: { at: number; version: number; body: ReturnType<typeof build> } | null = null;
  // An approved proposal changes visibility without this instance: its version bump drops the cache.
  const configVersion = () =>
    (
      sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as
        { version: number } | undefined
    )?.version ?? 0;

  const settings = () => ({
    enabled: getSetting(ENABLED_KEY) === 'true',
    title: getSetting(TITLE_KEY) ?? '',
    description: getSetting(DESCRIPTION_KEY) ?? '',
  });
  const stateOf = (status: string, stale: boolean): PublicState =>
    stale
      ? 'unknown'
      : status === 'available'
        ? 'up'
        : status === 'unavailable'
          ? 'down'
          : 'unknown';

  function build(now: number) {
    const rows = sqlite
      .prepare(
        `SELECT m.id,m.name,COALESCE(s.category,?) AS category FROM monitors m LEFT JOIN services s ON s.id=m.id
         WHERE m.is_public=1 ORDER BY s.id IS NOT NULL,category,s.position,m.name`,
      )
      .all(PROBES_GROUP) as { id: number; name: string; category: string }[];
    const current = new Map(observations.list(now).map((row) => [row.id, row]));
    const start = now - BAR_COUNT * BAR_MS;
    const checks = sqlite
      .prepare(
        `SELECT h.service_id AS id,h.observed_at AS at,json_extract(h.observation,'$.status') AS status
         FROM service_observation_history h JOIN monitors s ON s.id=h.service_id
         WHERE s.is_public=1 AND h.observed_at>=? AND h.observed_at<=?`,
      )
      .all(start, now) as { id: number; at: number; status: string }[];
    const perService = new Map<number, { up: number; down: number }[]>();
    for (const check of checks) {
      const bars =
        perService.get(check.id) ?? Array.from({ length: BAR_COUNT }, () => ({ up: 0, down: 0 }));
      perService.set(check.id, bars);
      const bar = bars[Math.min(BAR_COUNT - 1, Math.floor((check.at - start) / BAR_MS))];
      if (check.status === 'available') bar.up += 1;
      else if (check.status === 'unavailable') bar.down += 1;
    }
    const dayStart = Math.floor(now / DAY_MS) * DAY_MS - (PUBLIC_DAYS - 1) * DAY_MS;
    const rollup = sqlite
      .prepare(
        `SELECT r.service_id AS id,(r.hour/${DAY_MS})*${DAY_MS} AS day,SUM(r.up) AS up,SUM(r.down) AS down
         FROM service_uptime_rollup r JOIN monitors s ON s.id=r.service_id
         WHERE s.is_public=1 AND r.hour>=? GROUP BY r.service_id,day`,
      )
      .all(dayStart) as { id: number; day: number; up: number; down: number }[];
    const perDay = new Map<number, Map<number, { up: number; down: number }>>();
    for (const row of rollup) {
      const days = perDay.get(row.id) ?? new Map();
      perDay.set(row.id, days);
      days.set(row.day, row);
    }
    const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());
    const incidents = (
      sqlite
        .prepare(
          `SELECT s.name AS name,i.started_at AS startedAt,i.ended_at AS endedAt
           FROM service_incidents i JOIN monitors s ON s.id=i.service_id
           WHERE s.is_public=1 AND COALESCE(i.ended_at,?)>=? ORDER BY i.started_at DESC LIMIT ?`,
        )
        .all(now, now - INCIDENT_WINDOW_MS, INCIDENT_LIMIT) as {
        name: string;
        startedAt: number;
        endedAt: number | null;
      }[]
    ).map((row) => ({
      name: row.name,
      startedAt: iso(row.startedAt),
      endedAt: iso(row.endedAt),
    }));
    const maintenance = (
      sqlite
        .prepare(
          `SELECT s.name AS name,m.starts_at AS startsAt,m.ends_at AS endsAt
           FROM service_maintenance m JOIN monitors s ON s.id=m.service_id
           WHERE s.is_public=1 AND m.ends_at>? ORDER BY m.starts_at LIMIT 10`,
        )
        .all(now) as { name: string; startsAt: number; endsAt: number }[]
    ).map((row) => ({
      name: row.name,
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      active: row.startsAt <= now,
    }));
    return {
      incidents,
      maintenance,
      title: settings().title,
      description: settings().description,
      updatedAt: new Date(now).toISOString(),
      services: rows.map((row) => {
        const observation = current.get(row.id);
        const bars = perService.get(row.id) ?? [];
        const total = bars.reduce((sum, bar) => sum + bar.up + bar.down, 0);
        const up = bars.reduce((sum, bar) => sum + bar.up, 0);
        const days = perDay.get(row.id);
        const longUp = days ? [...days.values()].reduce((sum, day) => sum + day.up, 0) : 0;
        const longDown = days ? [...days.values()].reduce((sum, day) => sum + day.down, 0) : 0;
        return {
          name: row.name,
          category: row.category,
          uptime90:
            longUp + longDown ? Math.round((longUp / (longUp + longDown)) * 1000) / 10 : null,
          days: Array.from({ length: PUBLIC_DAYS }, (_, index): PublicState => {
            const day = days?.get(dayStart + index * DAY_MS);
            return !day || day.up + day.down === 0 ? 'unknown' : day.down > 0 ? 'down' : 'up';
          }),
          status: observation ? stateOf(observation.status, observation.stale) : 'unknown',
          checkedAt: observation?.lastAttempt ?? null,
          uptime: total ? Math.round((up / total) * 1000) / 10 : null,
          bars: Array.from({ length: BAR_COUNT }, (_, index): PublicState => {
            const bar = bars[index];
            return !bar || bar.up + bar.down === 0 ? 'unknown' : bar.down > 0 ? 'down' : 'up';
          }),
        };
      }),
    };
  }

  return {
    settings,
    setEnabled(enabled: boolean) {
      setSetting(ENABLED_KEY, enabled ? 'true' : 'false');
      cache = null;
    },
    setTitle(title: string) {
      setSetting(TITLE_KEY, title.trim().slice(0, PUBLIC_NAME_MAX));
      cache = null;
    },
    setDescription(description: string) {
      setSetting(DESCRIPTION_KEY, description.trim().slice(0, PUBLIC_DESCRIPTION_MAX));
      cache = null;
    },
    publicIds() {
      return new Set(
        (sqlite.prepare('SELECT id FROM monitors WHERE is_public=1').all() as { id: number }[]).map(
          (row) => row.id,
        ),
      );
    },
    setServicePublic(id: number, isPublic: boolean) {
      const changed = setMonitorPublic(sqlite, id, isPublic);
      cache = null;
      return changed;
    },
    /** Exactly what anonymous visitors receive right now; null when the page is off. */
    snapshot(now = Date.now()) {
      if (!settings().enabled) return null;
      const version = configVersion();
      if (!cache || cache.version !== version || now - cache.at > CACHE_MS || now < cache.at)
        cache = { at: now, version, body: build(now) };
      const { body } = cache;
      return body.services.length ? body : null;
    },
    /** Admin preview: same shape, even when the page is switched off or has no services. */
    preview(now = Date.now()) {
      return build(now);
    },
  };
}
