import { expect, it } from 'vitest';
import {
  defaultClockConfig as defaultClockPreferences,
  formatClock,
  isTimeZone,
} from '@homora/widgets/clock';

const at = new Date('2026-03-04T15:07:09Z');

it('formats the time in the chosen zone and hour format', () => {
  const base = { ...defaultClockPreferences, timeZone: 'UTC' };
  expect(formatClock('en', { ...base, hourFormat: '24h' }, at).time).toBe('15:07');
  expect(formatClock('en', { ...base, hourFormat: '12h' }, at).time).toMatch(/^0?3:07\s?PM$/);
  expect(formatClock('en', { ...base, hourFormat: '24h', seconds: true }, at).time).toBe(
    '15:07:09',
  );
  expect(formatClock('en', { ...base, timeZone: 'Asia/Tokyo', hourFormat: '24h' }, at).time).toBe(
    '00:07',
  );
});

it('ignores a saved zone the browser does not know', () => {
  expect(isTimeZone('Mars/Olympus')).toBe(false);
  expect(isTimeZone('')).toBe(false);
  expect(() =>
    formatClock('en', { ...defaultClockPreferences, timeZone: 'Mars/Olympus' }, at),
  ).not.toThrow();
});
