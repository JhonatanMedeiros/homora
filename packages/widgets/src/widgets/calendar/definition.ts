import { defineWidget } from '../../index.js';
import { isTimeZone } from '../../time-zone.js';

export type CalendarConfig = {
  weekStart: 'auto' | '0' | '1' | '2' | '3' | '4' | '5' | '6';
  timeZone: string;
};
export const defaultCalendarConfig: CalendarConfig = { weekStart: 'auto', timeZone: '' };
export const widgetCalendarWidget = defineWidget<CalendarConfig>({
  type: 'calendar',
  version: 1,
  locations: ['page'],
  sizes: ['normal', 'wide'],
  source: null,
  portable: true,
  defaultConfig: defaultCalendarConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (Object.keys(config).some((key) => !['weekStart', 'timeZone'].includes(key))) return null;
    if (!['auto', '0', '1', '2', '3', '4', '5', '6'].includes(config.weekStart as string))
      return null;
    if (
      typeof config.timeZone !== 'string' ||
      (config.timeZone !== '' && !isTimeZone(config.timeZone))
    )
      return null;
    return {
      weekStart: config.weekStart as CalendarConfig['weekStart'],
      timeZone: config.timeZone,
    };
  },
});

export function todayInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone: isTimeZone(timeZone) ? timeZone : undefined,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}
export function firstWeekday(locale: string, start: CalendarConfig['weekStart']) {
  if (start !== 'auto') return Number(start);
  const info = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  return (info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay ?? 7) % 7;
}
export function monthDays(year: number, month: number, start: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() - start + 7) % 7;
  const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from(
    { length: Math.ceil((offset + length) / 7) * 7 },
    (_, index) => new Date(Date.UTC(year, month, 1 - offset + index)),
  );
}
