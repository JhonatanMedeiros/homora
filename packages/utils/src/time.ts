const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type DurationParts = { days: number; hours: number; minutes: number; seconds: number };

/** Decomposes a non-negative millisecond duration into whole days, hours, minutes and seconds. */
export function splitDurationMs(ms: number): DurationParts {
  const total = Math.max(0, Math.round(ms));
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MIN);
  const seconds = Math.floor((total % MIN) / SEC);
  return { days, hours, minutes, seconds };
}

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
    // Older runtimes: fall back to UTC.
  }
  return ['UTC'];
}
