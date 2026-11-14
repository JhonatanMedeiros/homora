// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MonitoringSettings } from './monitoring-settings';
import { setLocale } from '@/i18n';

const calls: { url: string; init?: RequestInit }[] = [];
let current = false;
beforeEach(() => {
  setLocale('en');
  calls.length = 0;
  current = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/monitoring/trust')
        return new Response(JSON.stringify({ certificates: [], invalid: false }));
      if (init?.method === 'PUT') current = JSON.parse(String(init.body)).allowPrivate;
      return new Response(JSON.stringify({ allowPrivate: current }));
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the stored value and saves a change', async () => {
  render(<MonitoringSettings />);
  const toggle = screen.getByRole('switch', { name: 'New services allow private network' });
  await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
  const put = calls.find((call) => call.init?.method === 'PUT');
  expect(put?.url).toBe('/api/service-defaults');
  expect(JSON.parse(String(put?.init?.body))).toEqual({ allowPrivate: true });
});

it('keeps the previous value and reports an error when saving fails', async () => {
  render(<MonitoringSettings />);
  const toggle = screen.getByRole('switch', { name: 'New services allow private network' });
  await waitFor(() => expect((toggle as HTMLButtonElement).disabled).toBe(false));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 500 })),
  );
  fireEvent.click(toggle);
  expect(await screen.findByText('Could not save this setting.')).toBeTruthy();
  expect(toggle.getAttribute('aria-checked')).toBe('false');
});

it('uploads and removes a monitoring certificate bundle', async () => {
  let certificates: { subject: string; validFrom: string; validTo: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== '/api/monitoring/trust')
        return new Response(JSON.stringify({ allowPrivate: false }));
      if (init?.method === 'PUT') {
        expect(JSON.parse(String(init.body))).toEqual({ bundle: 'test certificate' });
        certificates = [
          {
            subject: 'CN=Example',
            validFrom: '2024-01-01T00:00:00.000Z',
            validTo: '2030-01-01T00:00:00.000Z',
          },
        ];
      }
      if (init?.method === 'DELETE') certificates = [];
      return new Response(JSON.stringify({ certificates, invalid: false }));
    }),
  );
  render(<MonitoringSettings />);
  await screen.findByRole('button', { name: 'Remove certificates' });
  const file = new File(['test certificate'], 'ca.pem', { type: 'application/x-pem-file' });
  fireEvent.change(screen.getByLabelText('Certificate bundle'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload certificates' }));
  expect(await screen.findByText('CN=Example')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove certificates' }));
  await waitFor(() => expect(screen.queryByText('CN=Example')).toBeNull());
});
