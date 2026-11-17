import { defineWidget, monitoringSources, type MonitoringIncident } from '../../index.js';

export type RecentIncidentsConfig = {
  periodDays: 1 | 7 | 30;
  limit: number;
  groups: string[];
  pages: string[];
  minimumMinutes: number;
};

export const defaultRecentIncidentsConfig: RecentIncidentsConfig = {
  periodDays: 7,
  limit: 5,
  groups: [],
  pages: [],
  minimumMinutes: 0,
};

const names = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(
    (name) =>
      typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 100,
  ) &&
  new Set(value).size === value.length;

export const widgetRecentIncidentsWidget = defineWidget<RecentIncidentsConfig>({
  type: 'recent-incidents',
  version: 1,
  locations: ['page'],
  source: monitoringSources.incidents,
  portable: true,
  sizes: ['normal', 'wide'],
  defaultConfig: defaultRecentIncidentsConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const c = value as Record<string, unknown>;
    if (
      Object.keys(c).some(
        (key) => !['periodDays', 'limit', 'groups', 'pages', 'minimumMinutes'].includes(key),
      )
    )
      return null;
    if (
      (c.periodDays !== 1 && c.periodDays !== 7 && c.periodDays !== 30) ||
      !Number.isInteger(c.limit) ||
      (c.limit as number) < 1 ||
      (c.limit as number) > 10 ||
      !names(c.groups) ||
      !names(c.pages) ||
      !Number.isInteger(c.minimumMinutes) ||
      (c.minimumMinutes as number) < 0 ||
      (c.minimumMinutes as number) > 43200
    )
      return null;
    return {
      periodDays: c.periodDays,
      limit: c.limit as number,
      groups: c.groups,
      pages: c.pages,
      minimumMinutes: c.minimumMinutes as number,
    };
  },
});

/** Keep open incidents first, then sort by their original start; do not collapse repeated outages. */
export function recentIncidents(
  items: MonitoringIncident[],
  config: RecentIncidentsConfig,
  now: number,
): MonitoringIncident[] {
  const since = now - config.periodDays * 86_400_000;
  return items
    .filter(
      (item) =>
        item.startedAt <= now &&
        (item.endedAt === null || item.endedAt >= since) &&
        Math.max(0, (item.endedAt ?? now) - item.startedAt) >= config.minimumMinutes * 60_000,
    )
    .sort(
      (a, b) =>
        Number(a.endedAt !== null) - Number(b.endedAt !== null) ||
        b.startedAt - a.startedAt ||
        b.id - a.id,
    )
    .slice(0, config.limit);
}

export function incidentDuration(
  milliseconds: number,
  locale: string,
  unitDisplay: 'short' | 'long' = 'short',
): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const number = new Intl.NumberFormat(locale, {
    style: 'unit',
    unitDisplay,
    unit: 'minute',
  });
  const parts: string[] = [];
  if (days)
    parts.push(
      new Intl.NumberFormat(locale, { style: 'unit', unitDisplay, unit: 'day' }).format(days),
    );
  if (hours)
    parts.push(
      new Intl.NumberFormat(locale, { style: 'unit', unitDisplay, unit: 'hour' }).format(hours),
    );
  if (!days && (minutes || !hours)) parts.push(number.format(minutes));
  return new Intl.ListFormat(locale, { style: 'short', type: 'unit' }).format(parts);
}
