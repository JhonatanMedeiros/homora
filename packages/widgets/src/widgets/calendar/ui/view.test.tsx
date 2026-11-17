// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WidgetHostProvider } from '../../../ui/host.js';
import { defaultCalendarConfig } from '../definition.js';
import { CalendarView } from './index.js';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('navigates with keyboard and returns to today, identifying the current date', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-02-15T12:00:00Z'));
  render(
    <WidgetHostProvider value={{ locale: 'en-US', t: (key) => key }}>
      <CalendarView config={{ ...defaultCalendarConfig, timeZone: 'UTC' }} />
    </WidgetHostProvider>,
  );
  expect(
    screen.getByRole('table', { name: 'February 2024' }).querySelector('[aria-current="date"]')
      ?.textContent,
  ).toBe('15');
  const next = screen.getByRole('button', { name: 'pageWidgets.calendarNext' });
  next.focus();
  expect(document.activeElement).toBe(next);
  fireEvent.click(next);
  expect(screen.getByRole('table', { name: 'March 2024' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'pageWidgets.calendarPrevious' }));
  fireEvent.click(screen.getByRole('button', { name: 'pageWidgets.calendarPrevious' }));
  expect(screen.getByRole('table', { name: 'January 2024' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'pageWidgets.calendarToday' }));
  expect(screen.getByRole('table', { name: 'February 2024' })).toBeTruthy();
});
it('updates at midnight', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-12-31T23:59:00Z'));
  render(
    <WidgetHostProvider value={{ locale: 'en-US', t: (key) => key }}>
      <CalendarView config={{ ...defaultCalendarConfig, timeZone: 'UTC' }} />
    </WidgetHostProvider>,
  );
  expect(
    screen.getByRole('table', { name: 'December 2024' }).querySelector('[aria-current="date"]')
      ?.textContent,
  ).toBe('31');
  act(() => vi.advanceTimersByTime(60_000));
  expect(
    screen.getByRole('table', { name: 'January 2025' }).querySelector('[aria-current="date"]')
      ?.textContent,
  ).toBe('1');
});
