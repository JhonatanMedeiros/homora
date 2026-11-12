export type HourFormat = 'auto' | '12h' | '24h';

export type ClockPreferences = {
  hourFormat: HourFormat;
  /** IANA name such as `America/Sao_Paulo`; empty follows the browser. */
  timeZone: string;
  seconds: boolean;
  date: boolean;
};

export const defaultClockPreferences: ClockPreferences = {
  hourFormat: 'auto',
  timeZone: '',
  seconds: false,
  date: true,
};

/** True only for names the runtime can format; saved values may come from another browser. */
export function isTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function listTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (supported?.length) return supported.includes('UTC') ? supported : ['UTC', ...supported];
  } catch {
    // Older runtimes: fall back to the zones that matter most.
  }
  return ['UTC'];
}

export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Time, date and the zone abbreviation, formatted for the given preferences. */
export function formatClock(locale: string, prefs: ClockPreferences, now: Date) {
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
