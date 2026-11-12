// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicStatusSettings } from './public-status-settings';
import { setLocale } from '@/i18n';

const admin = (enabled: boolean) => ({
  enabled,
  title: 'Lab',
  description: '',
  preview: {
    title: 'Lab',
    description: '',
    updatedAt: new Date().toISOString(),
    services: [
      {
        name: 'Jellyfin',
        category: 'Media',
        status: 'up',
        checkedAt: null,
        uptime: null,
        bars: [],
      },
    ],
  },
});

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the public address with copy and open actions', async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(admin(true)))),
  );
  render(<PublicStatusSettings />);
  const address = (await screen.findByLabelText('Public address')) as HTMLInputElement;
  expect(address.value).toBe(`${window.location.origin}/status`);
  const open = screen.getByRole('link', { name: 'Open page' });
  expect(open.getAttribute('href')).toBe(address.value);
  expect(open.getAttribute('target')).toBe('_blank');
  expect(open.getAttribute('rel')).toContain('noopener');
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(address.value));
  expect(await screen.findByRole('button', { name: 'Link copied' })).toBeTruthy();
  expect(screen.getByText('1 service is public')).toBeTruthy();
});

it('warns that the page is closed while it is off, and saves title and description together', async () => {
  const calls: { method?: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method, body: init?.body as string | undefined });
      return new Response(JSON.stringify(admin(false)));
    }),
  );
  render(<PublicStatusSettings />);
  expect(await screen.findByText(/Closed until you enable the page/)).toBeTruthy();
  expect(screen.getByText('Off')).toBeTruthy();
  const save = screen.getByRole('button', { name: 'Save title' });
  expect(save.hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Short description (optional)'), {
    target: { value: 'Home services' },
  });
  fireEvent.click(save);
  await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true));
  expect(JSON.parse(calls.find((call) => call.method === 'PUT')?.body ?? '{}')).toEqual({
    title: 'Lab',
    description: 'Home services',
  });
});
