// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InterfaceSettings } from './interface-settings';
import { setLocale } from '@/i18n';

beforeEach(() => {
  setLocale('en');
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]')),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('keeps the clock options hidden until the top bar is on', () => {
  render(<InterfaceSettings />);
  expect(screen.queryByLabelText('Show seconds')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: /Show the top bar/ }));
  expect(localStorage.getItem('homora-top-bar')).toBe('on');
  expect(screen.getByRole('switch', { name: 'Show seconds' })).toBeTruthy();
  expect(screen.getByLabelText('Time zone')).toBeTruthy();
});

it('saves the hour format, seconds and time zone in this browser', () => {
  localStorage.setItem('homora-top-bar', 'on');
  render(<InterfaceSettings />);
  fireEvent.click(screen.getByRole('radio', { name: '24 h', checked: false }));
  fireEvent.click(screen.getByRole('switch', { name: 'Show seconds' }));
  fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'UTC' } });
  expect(localStorage.getItem('homora-clock-hours')).toBe('24h');
  expect(localStorage.getItem('homora-clock-seconds')).toBe('on');
  expect(localStorage.getItem('homora-clock-timezone')).toBe('UTC');
});

it('saves the home layout and only allows descriptions in cards', () => {
  render(<InterfaceSettings />);
  const descriptions = screen.getByRole('switch', { name: 'Descriptions' });
  expect(descriptions.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
  expect(localStorage.getItem('homora-density')).toBe('cards');
  expect(descriptions.hasAttribute('disabled')).toBe(false);
});
