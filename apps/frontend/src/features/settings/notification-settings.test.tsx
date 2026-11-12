// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationSettings } from './notification-settings';
import { setLocale } from '@/i18n';

it('creates a webhook without displaying its saved destination', async () => {
  setLocale('en');
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          name: 'Alerts',
          type: 'webhook',
          enabled: true,
          allowPrivate: false,
          includeUrl: false,
          lastSentAt: null,
          lastError: null,
          failures: 0,
        },
      ],
    });
  vi.stubGlobal('fetch', fetchMock);
  render(<NotificationSettings />);
  await screen.findByText('No notification channels yet.');
  fireEvent.change(screen.getByLabelText('Channel name'), { target: { value: 'Alerts' } });
  fireEvent.change(screen.getByLabelText('Webhook URL (HTTPS)'), {
    target: { value: 'https://hooks.example/secret' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save channel' }));
  await waitFor(() => expect(screen.getByText('Alerts')).toBeTruthy());
  expect(fetchMock.mock.calls[1][1].body).toContain('https://hooks.example/secret');
  expect((screen.getByLabelText('Webhook URL (HTTPS)') as HTMLInputElement).value).toBe('');
});
afterEach(() => vi.unstubAllGlobals());
