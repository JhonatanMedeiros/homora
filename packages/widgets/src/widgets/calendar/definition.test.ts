import { describe, expect, it } from 'vitest';
import {
  defaultCalendarConfig,
  firstWeekday,
  monthDays,
  todayInZone,
  widgetCalendarWidget,
} from './definition.js';
describe('calendar', () => {
  it('validates strict configuration and time zones', () => {
    expect(widgetCalendarWidget.parseConfig({ weekStart: '1', timeZone: 'UTC' })).toEqual({
      weekStart: '1',
      timeZone: 'UTC',
    });
    expect(widgetCalendarWidget.parseConfig({ ...defaultCalendarConfig, extra: true })).toBeNull();
    expect(
      widgetCalendarWidget.parseConfig({ ...defaultCalendarConfig, timeZone: 'bad/zone' }),
    ).toBeNull();
  });
  it('builds weeks across leap days, months and years', () => {
    const sunday = monthDays(2024, 1, 0);
    const monday = monthDays(2024, 1, 1);
    expect(sunday[0]?.toISOString().slice(0, 10)).toBe('2024-01-28');
    expect(monday[0]?.toISOString().slice(0, 10)).toBe('2024-01-29');
    expect(sunday.map((d) => d.toISOString().slice(0, 10))).toContain('2024-02-29');
    expect(monthDays(2025, 0, 0)[0]?.toISOString().slice(0, 10)).toBe('2024-12-29');
    expect(firstWeekday('en-US', 'auto')).toBe(0);
    expect(firstWeekday('en-GB', 'auto')).toBe(1);
  });
  it('derives the date in the configured zone', () => {
    const now = new Date('2025-01-01T01:00:00Z');
    expect(todayInZone(now, 'America/New_York').toISOString().slice(0, 10)).toBe('2024-12-31');
    expect(todayInZone(now, 'Asia/Tokyo').toISOString().slice(0, 10)).toBe('2025-01-01');
  });
});
