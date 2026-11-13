// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  await screen.findByText('No webhooks configured.');
  expect(screen.getByText('No Telegram channels configured.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add webhook' }));
  fireEvent.change(screen.getByLabelText('Channel name'), { target: { value: 'Alerts' } });
  fireEvent.change(screen.getByLabelText('Webhook URL (HTTPS)'), {
    target: { value: 'https://hooks.example/secret' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save channel' }));
  await waitFor(() => expect(screen.getByText('Alerts')).toBeTruthy());
  expect(fetchMock.mock.calls[1][1].body).toContain('https://hooks.example/secret');
  expect(screen.queryByLabelText('Webhook URL (HTTPS)')).toBeNull();
});

it('opens the Telegram form separately and allows cancelling it', async () => {
  setLocale('en');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  render(<NotificationSettings />);
  await screen.findByText('No Telegram channels configured.');
  fireEvent.click(screen.getByRole('button', { name: 'Add Telegram' }));
  expect(screen.getByLabelText('Bot token')).toBeTruthy();
  expect(screen.getByLabelText('Message language').textContent).toContain('English');
  expect(screen.getByLabelText('Chat ID')).toBeTruthy();
  expect(screen.queryByLabelText('Webhook URL (HTTPS)')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByLabelText('Bot token')).toBeNull();
});
it('creates an ntfy channel with an optional token and a Discord channel without one', async () => {
  setLocale('en');
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1 }) })
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 2 }) })
    .mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal('fetch', fetchMock);
  render(<NotificationSettings />);
  await screen.findByText('No ntfy channels configured.');
  expect(screen.getByText('No Discord channels configured.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add ntfy' }));
  expect(screen.getByLabelText('Access token (optional)')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Channel name'), { target: { value: 'Phone' } });
  fireEvent.change(screen.getByLabelText('Topic address (https://ntfy.sh/your-topic)'), {
    target: { value: 'https://ntfy.sh/homora' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save channel' }));
  await waitFor(() => expect(fetchMock.mock.calls[1][1].body).toContain('"type":"ntfy"'));
  expect(fetchMock.mock.calls[1][1].body).toContain('https://ntfy.sh/homora');
  expect(fetchMock.mock.calls[1][1].body).toContain('"locale":"en"');

  fireEvent.click(screen.getByRole('button', { name: 'Add Discord' }));
  expect(screen.queryByLabelText('Access token (optional)')).toBeNull();
  fireEvent.change(screen.getByLabelText('Channel name'), { target: { value: 'Team' } });
  fireEvent.change(screen.getByLabelText('Discord webhook URL'), {
    target: { value: 'https://discord.com/api/webhooks/1/abc' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save channel' }));
  await waitFor(() => expect(fetchMock.mock.calls[3][1].body).toContain('"type":"discord"'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('groups existing channels and edits one without revealing its secret', async () => {
  setLocale('en');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 1,
          name: 'Automation',
          type: 'webhook',
          enabled: true,
          allowPrivate: false,
          includeUrl: false,
          lastSentAt: null,
          lastError: null,
          failures: 0,
        },
        {
          id: 2,
          name: 'My chat',
          type: 'telegram',
          enabled: false,
          allowPrivate: false,
          includeUrl: false,
          lastSentAt: null,
          lastError: null,
          failures: 0,
        },
      ],
    }),
  );
  render(<NotificationSettings />);
  await screen.findByText('Automation');
  const telegram = screen.getByRole('region', { name: /Telegram/ });
  expect(telegram.textContent).toContain('My chat');
  expect(telegram.textContent).toContain('Disabled');
  fireEvent.click(within(telegram).getByRole('button', { name: 'Edit' }));
  expect((screen.getByLabelText('Bot token') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Chat ID') as HTMLInputElement).value).toBe('');
  expect((screen.getByRole('button', { name: 'Add webhook' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
