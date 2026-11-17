import { describe, expect, it } from 'vitest';
import { countdownRemaining, countdownTarget, countdownWidget } from './definition.js';

const config = {
  eventName: 'Renewal',
  localDateTime: '2030-01-03T12:00',
  timeZone: 'UTC',
  pastBehavior: 'keep' as const,
};
describe('countdown', () => {
  it('strictly validates name, date, zone and keys', () => {
    expect(countdownWidget.parseConfig(config)).toEqual(config);
    for (const change of [
      { eventName: ' ' },
      { eventName: 'x'.repeat(61) },
      { localDateTime: '2030-02-30T12:00' },
      { timeZone: 'invalid/zone' },
      { extra: true },
    ])
      expect(countdownWidget.parseConfig({ ...config, ...change })).toBeNull();
  });
  it('calculates days, hours, minutes and past events', () => {
    expect(countdownRemaining(config, new Date('2030-01-01T12:00Z'))).toMatchObject({
      days: 2,
      past: false,
    });
    expect(countdownRemaining(config, new Date('2030-01-03T10:15Z'))).toMatchObject({
      hours: 1,
      minutes: 45,
    });
    expect(countdownRemaining(config, new Date('2030-01-03T11:30Z'))).toMatchObject({
      hours: 0,
      minutes: 30,
    });
    expect(countdownRemaining(config, new Date('2030-01-05T12:00Z'))).toMatchObject({
      days: 2,
      past: true,
    });
  });
  it('resolves a different zone, DST gap and overlap', () => {
    expect(countdownTarget({ ...config, timeZone: 'Asia/Tokyo' }).toISOString()).toBe(
      '2030-01-03T03:00:00.000Z',
    );
    expect(
      countdownTarget({
        ...config,
        timeZone: 'America/New_York',
        localDateTime: '2024-03-10T02:30',
      }).toISOString(),
    ).toBe('2024-03-10T07:30:00.000Z');
    expect(
      countdownTarget({
        ...config,
        timeZone: 'America/New_York',
        localDateTime: '2024-11-03T01:30',
      }).toISOString(),
    ).toBe('2024-11-03T05:30:00.000Z');
  });
});
