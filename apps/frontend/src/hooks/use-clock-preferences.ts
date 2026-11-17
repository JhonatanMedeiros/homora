import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { defaultClockConfig, isTimeZone, type ClockConfig } from '@homora/widgets/clock';

const KEYS = {
  hourFormat: 'homora-clock-hours',
  timeZone: 'homora-clock-timezone',
  seconds: 'homora-clock-seconds',
  date: 'homora-clock-date',
} as const;

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preference only applies to this page session.
  }
  listeners.forEach((listener) => listener());
}

// One primitive snapshot, so `useSyncExternalStore` compares by value and never loops.
const snapshot = () =>
  [read(KEYS.hourFormat), read(KEYS.timeZone), read(KEYS.seconds), read(KEYS.date)].join('|');
const serverSnapshot = () => '|||';

/** Browser-local clock preferences for the top bar: hour format, time zone, seconds and date. */
export function useClockPreferences() {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const preferences = useMemo<ClockConfig>(() => {
    const [hours, zone, seconds, date] = raw.split('|');
    return {
      hourFormat: hours === '12h' || hours === '24h' ? hours : defaultClockConfig.hourFormat,
      timeZone: isTimeZone(zone) ? zone : '',
      seconds: seconds === 'on',
      date: date !== 'off',
    };
  }, [raw]);
  const setHourFormat = useCallback(
    (value: ClockConfig['hourFormat']) => write(KEYS.hourFormat, value),
    [],
  );
  const setTimeZone = useCallback((value: string) => write(KEYS.timeZone, value), []);
  const setSeconds = useCallback((value: boolean) => write(KEYS.seconds, value ? 'on' : 'off'), []);
  const setDate = useCallback((value: boolean) => write(KEYS.date, value ? 'on' : 'off'), []);
  return { ...preferences, setHourFormat, setTimeZone, setSeconds, setDate };
}
