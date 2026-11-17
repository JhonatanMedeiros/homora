import { definePresenter, defineWidget } from '../../index.js';

export type ClockConfig = {
  hourFormat: 'auto' | '12h' | '24h';
  timeZone: string;
  seconds: boolean;
  date: boolean;
};

export const defaultClockConfig: ClockConfig = {
  hourFormat: 'auto',
  timeZone: '',
  seconds: false,
  date: true,
};

import { isTimeZone } from '../../time-zone.js';
export { isTimeZone, listTimeZones } from '../../time-zone.js';

export const clockWidget = defineWidget<ClockConfig>({
  type: 'clock',
  version: 1,
  locations: ['page', 'top-bar'],
  source: null,
  portable: true,
  defaultConfig: defaultClockConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).some(
        (key) => !['hourFormat', 'timeZone', 'seconds', 'date'].includes(key),
      )
    )
      return null;
    if (config.hourFormat !== 'auto' && config.hourFormat !== '12h' && config.hourFormat !== '24h')
      return null;
    if (
      typeof config.timeZone !== 'string' ||
      (config.timeZone !== '' && !isTimeZone(config.timeZone))
    )
      return null;
    if (typeof config.seconds !== 'boolean' || typeof config.date !== 'boolean') return null;
    return {
      hourFormat: config.hourFormat,
      timeZone: config.timeZone,
      seconds: config.seconds,
      date: config.date,
    };
  },
});

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Time, date and the zone abbreviation, formatted for the given preferences. */
export function formatClock(locale: string, prefs: ClockConfig, now: Date) {
  const timeZone = isTimeZone(prefs.timeZone) ? prefs.timeZone : undefined;
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(prefs.seconds ? { second: '2-digit' } : {}),
    ...(prefs.hourFormat === 'auto' ? {} : { hour12: prefs.hourFormat === '12h' }),
    timeZone,
  }).format(now);
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(now);
  const zone =
    new Intl.DateTimeFormat(locale, { timeZoneName: 'short', timeZone })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value ?? '';
  return { time, date, zone };
}

export const clockPresentation = definePresenter({
  present: (input: { locale: string; config: ClockConfig; now: Date }) =>
    formatClock(input.locale, input.config, input.now),
});
