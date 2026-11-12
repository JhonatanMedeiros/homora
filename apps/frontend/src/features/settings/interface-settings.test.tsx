// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HomeSettings, TopBarSettings } from './interface-settings';
import { setLocale } from '@/i18n';
import { chooseSelectOption } from '@/test-select';

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
  render(<TopBarSettings />);
  expect(screen.queryByLabelText('Show seconds')).toBeNull();
  fireEvent.click(screen.getByRole('switch', { name: /Show the top bar/ }));
  expect(localStorage.getItem('homora-top-bar')).toBe('on');
  expect(screen.getByRole('switch', { name: 'Show seconds' })).toBeTruthy();
  expect(screen.getByLabelText('Time zone')).toBeTruthy();
});

it(
  'saves the hour format, seconds and time zone in this browser',
  { timeout: 20_000 },
  async () => {
    localStorage.setItem('homora-top-bar', 'on');
    render(<TopBarSettings />);
    fireEvent.click(screen.getByRole('radio', { name: '24 h', checked: false }));
    fireEvent.click(screen.getByRole('switch', { name: 'Show seconds' }));
    await chooseSelectOption('Time zone', 'UTC');
    expect(localStorage.getItem('homora-clock-hours')).toBe('24h');
    expect(localStorage.getItem('homora-clock-seconds')).toBe('on');
    expect(localStorage.getItem('homora-clock-timezone')).toBe('UTC');
  },
);

it('saves the home layout and only allows descriptions in cards', () => {
  render(<HomeSettings />);
  const descriptions = screen.getByRole('switch', { name: 'Descriptions' });
  expect(descriptions.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
  expect(localStorage.getItem('homora-density')).toBe('cards');
  expect(descriptions.hasAttribute('disabled')).toBe(false);
});

it('turns the single-key shortcuts off and on, on by default', () => {
  render(<TopBarSettings />);
  const toggle = screen.getByRole('switch', { name: 'Keyboard shortcuts' });
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(toggle);
  expect(localStorage.getItem('homora-shortcuts')).toBe('off');
  expect(screen.getByText(/Ctrl\/Cmd\+K and Ctrl\/Cmd\+B always work/)).toBeTruthy();
});

it('keeps web search off by default and warns that the text goes to a third party', async () => {
  render(<TopBarSettings />);
  const toggle = screen.getByRole('switch', { name: 'Web search' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(
    screen.getByText(/only the text you typed goes to the search engine, a third party/),
  ).toBeTruthy();
  expect(screen.queryByLabelText('Search engine')).toBeNull();
  fireEvent.click(toggle);
  expect(localStorage.getItem('homora-web-search')).toBe('on');
  await chooseSelectOption('Search engine', 'Brave');
  expect(localStorage.getItem('homora-web-search-engine')).toBe('brave');
});

it('validates the custom search URL before saving it', () => {
  localStorage.setItem('homora-web-search', 'on');
  localStorage.setItem('homora-web-search-engine', 'custom');
  render(<TopBarSettings />);
  const field = screen.getByLabelText('Custom search URL');
  fireEvent.change(field, { target: { value: 'https://example.com/?q=' } });
  expect(screen.getByText('The URL must contain %s where the search text goes.')).toBeTruthy();
  fireEvent.change(field, { target: { value: 'javascript:alert(%s)' } });
  expect(screen.getByText('Only https: URLs are allowed.')).toBeTruthy();
  expect(localStorage.getItem('homora-web-search-url')).toBeNull();
  fireEvent.change(field, { target: { value: 'https://example.com/?q=%s' } });
  expect(localStorage.getItem('homora-web-search-url')).toBe('https://example.com/?q=%s');
  expect(screen.queryByText('Only https: URLs are allowed.')).toBeNull();
});
