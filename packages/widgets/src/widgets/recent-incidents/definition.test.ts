import { describe, expect, it } from 'vitest';
import {
  defaultRecentIncidentsConfig as config,
  incidentDuration,
  recentIncidents,
  widgetRecentIncidentsWidget,
} from './definition.js';
import type { MonitoringIncident } from '../../monitoring.js';

const now = 100 * 86_400_000;
const incident = (id: number, start: number, end: number | null): MonitoringIncident => ({
  id,
  monitorId: 1,
  name: 'Service',
  reason: 'no-response',
  httpStatus: null,
  hasService: true,
  startedAt: now - start,
  endedAt: end === null ? null : now - end,
});

describe('recent incidents', () => {
  it('validates strict configuration and supported bounds', () => {
    expect(widgetRecentIncidentsWidget.parseConfig(config)).toEqual(config);
    for (const value of [
      { ...config, limit: 11 },
      { ...config, periodDays: 31 },
      { ...config, groups: ['same', 'same'] },
      { ...config, minimumMinutes: -1 },
      { ...config, extra: true },
      null,
    ])
      expect(widgetRecentIncidentsWidget.parseConfig(value)).toBeNull();
  });
  it('puts open incidents first and orders, filters and limits without collapsing a service', () => {
    const items = [
      incident(1, 120_000, 60_000),
      incident(2, 300_000, null),
      incident(3, 180_000, 0),
      incident(4, 40 * 86_400_000, 39 * 86_400_000),
    ];
    expect(recentIncidents(items, { ...config, limit: 2 }, now).map((i) => i.id)).toEqual([2, 1]);
    expect(recentIncidents(items, { ...config, minimumMinutes: 2 }, now).map((i) => i.id)).toEqual([
      2, 3,
    ]);
    expect(recentIncidents([], config, now)).toEqual([]);
  });
  it('formats minutes, hours and long durations', () => {
    expect(incidentDuration(7 * 60_000, 'en')).toContain('7 min');
    expect(incidentDuration(2 * 3_600_000, 'en')).toContain('2 hr');
    expect(incidentDuration(49 * 3_600_000, 'en')).toContain('2 day');
  });
});
