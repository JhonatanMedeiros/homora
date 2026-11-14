import { expect, it } from 'vitest';
import { fromLocalInput, toLocalInput, validWindow } from './maintenance-view';

it('round-trips local date-time input values at minute precision', () => {
  const time = new Date(2026, 10, 12, 23, 5).getTime();
  expect(toLocalInput(time)).toBe('2026-11-12T23:05');
  expect(fromLocalInput('2026-11-12T23:05')).toBe(time);
  expect(Number.isNaN(fromLocalInput(''))).toBe(true);
});

it('accepts windows from a minute to thirty days and nothing else', () => {
  const start = 1_800_000_000_000;
  expect(validWindow(start, start + 60_000)).toBe(true);
  expect(validWindow(start, start + 59_000)).toBe(false);
  expect(validWindow(start, start - 1)).toBe(false);
  expect(validWindow(start, start + 30 * 86_400_000)).toBe(true);
  expect(validWindow(start, start + 30 * 86_400_000 + 1)).toBe(false);
  expect(validWindow(start, Number.NaN)).toBe(false);
});
