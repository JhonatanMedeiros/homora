import { defineWidget } from '../../index.js';
import { isTimeZone } from '../../time-zone.js';

export type CountdownConfig = {
  eventName: string;
  localDateTime: string;
  timeZone: string;
  pastBehavior: 'keep' | 'hide';
};

export const defaultCountdownConfig: CountdownConfig = {
  eventName: '',
  localDateTime: '',
  timeZone: '',
  pastBehavior: 'keep',
};

export const countdownWidget = defineWidget<CountdownConfig>({
  type: 'countdown',
  version: 1,
  locations: ['page'],
  source: null,
  portable: true,
  defaultConfig: defaultCountdownConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).some(
        (key) => !['eventName', 'localDateTime', 'timeZone', 'pastBehavior'].includes(key),
      )
    )
      return null;
    if (
      typeof config.eventName !== 'string' ||
      !config.eventName.trim() ||
      config.eventName.length > 60
    )
      return null;
    if (typeof config.localDateTime !== 'string' || !validLocalDateTime(config.localDateTime))
      return null;
    if (
      typeof config.timeZone !== 'string' ||
      (config.timeZone !== '' && !isTimeZone(config.timeZone))
    )
      return null;
    if (config.pastBehavior !== 'keep' && config.pastBehavior !== 'hide') return null;
    return {
      eventName: config.eventName.trim(),
      localDateTime: config.localDateTime,
      timeZone: config.timeZone,
      pastBehavior: config.pastBehavior,
    };
  },
});

function validLocalDateTime(value: string): boolean {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) return false;
  const date = new Date(`${value}:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 16) === value &&
    Number(value.slice(0, 4)) >= 1
  );
}

/** Resolve overlap to the earlier instant and a gap by moving forward by the gap. */
export function countdownTarget(config: CountdownConfig): Date {
  const zone = config.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const desired = Date.parse(`${config.localDateTime}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const localAt = (instant: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(instant).map((part) => [part.type, part.value]),
    );
    return Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`,
    );
  };
  const offsets = new Set<number>();
  for (let hour = -36; hour <= 36; hour += 6) {
    const instant = desired + hour * 3_600_000;
    offsets.add(localAt(instant) - instant);
  }
  const candidates = [...offsets].map((offset) => desired - offset);
  const exact = candidates.filter((instant) => localAt(instant) === desired).sort((a, b) => a - b);
  if (exact.length > 0) return new Date(exact[0]!);
  const forward = candidates
    .filter((instant) => localAt(instant) > desired)
    .sort((a, b) => localAt(a) - localAt(b));
  return new Date(forward[0] ?? desired);
}

export function countdownRemaining(config: CountdownConfig, now: Date) {
  const target = countdownTarget(config);
  const diff = target.getTime() - now.getTime();
  const past = diff <= 0;
  const minutes = Math.floor(Math.abs(diff) / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60);
  return { target, past, days, hours, minutes: hours >= 1 ? minutes % 60 : minutes };
}
