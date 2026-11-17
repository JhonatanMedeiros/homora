// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WidgetHostProvider } from '../../../ui/host.js';
import { defaultCertificateConfig } from '../definition.js';
import { en, ptBR } from '../messages.js';
import { CertificateView } from './index.js';

afterEach(cleanup);
it.each([
  ['en', en],
  ['pt-BR', ptBR],
] as const)('shows prior readings and opens service details in %s', async (locale, messages) => {
  const openMonitor = vi.fn();
  const now = Date.now();
  const readCertificates = vi.fn().mockResolvedValue({
    generatedAt: now,
    total: 6,
    missingFilter: false,
    items: [
      {
        id: 1,
        name: 'Service',
        expiresAt: now - 3600000,
        observedAt: now - 60000,
        stale: true,
        state: 'down',
      },
    ],
  });
  const t = (key: string, params?: Record<string, string | number>) =>
    Object.entries(params ?? {}).reduce(
      (text, [k, value]) => text.replace(`{${k}}`, String(value)),
      messages[key as keyof typeof messages] ?? key,
    );
  render(
    <WidgetHostProvider
      value={{
        locale,
        t,
        openMonitor,
        monitoring: { readCertificates, readSummary: vi.fn(), readScopes: vi.fn() },
      }}
    >
      <CertificateView config={defaultCertificateConfig} />
    </WidgetHostProvider>,
  );
  const button = await screen.findByRole('button', { name: /Service/ });
  expect(button.textContent).toContain(messages['certificate.expired']);
  expect(screen.getByText(/Service/)).toBeTruthy();
  expect(
    screen.getByText(locale === 'en' ? /Previous reading observed/ : /Leitura anterior observada/),
  ).toBeTruthy();
  fireEvent.click(button);
  expect(openMonitor).toHaveBeenCalledWith(1, true);
});

it('keeps failed refreshes marked stale and updates after renewal', async () => {
  vi.useFakeTimers();
  const now = Date.now();
  const item = {
    id: 1,
    name: 'Service',
    expiresAt: now + 1000,
    observedAt: now,
    stale: false,
    state: 'down' as const,
  };
  const data = (expiresAt: number) => ({
    generatedAt: Date.now(),
    total: 1,
    missingFilter: false,
    items: [{ ...item, expiresAt }],
  });
  const readCertificates = vi
    .fn()
    .mockResolvedValueOnce(data(item.expiresAt))
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockImplementation(async () => data(Date.now() + 90 * 86_400_000));
  const t = (key: string) => en[key as keyof typeof en] ?? key;
  try {
    await act(async () => {
      render(
        <WidgetHostProvider
          value={{
            locale: 'en',
            t,
            openMonitor: vi.fn(),
            monitoring: { readCertificates, readSummary: vi.fn(), readScopes: vi.fn() },
          }}
        >
          <CertificateView config={defaultCertificateConfig} />
        </WidgetHostProvider>,
      );
    });
    expect(screen.getByText('Expiring soon')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('Expired')).toBeTruthy();
    expect(screen.getByText(en['certificate.stale'])).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('Not expired')).toBeTruthy();
    expect(screen.queryByText(en['certificate.stale'])).toBeNull();
  } finally {
    cleanup();
    vi.useRealTimers();
  }
});

it.each([
  [
    'empty',
    { generatedAt: Date.now(), total: 0, missingFilter: false, items: [] },
    en['certificate.empty'],
  ],
  [
    'missing',
    { generatedAt: Date.now(), total: 0, missingFilter: true, items: [] },
    en['certificate.missing'],
  ],
] as const)('distinguishes %s from failure', async (_name, data, expected) => {
  const t = (key: string) => en[key as keyof typeof en] ?? key;
  render(
    <WidgetHostProvider
      value={{
        locale: 'en',
        t,
        monitoring: {
          readCertificates: vi.fn().mockResolvedValue(data),
          readSummary: vi.fn(),
          readScopes: vi.fn(),
        },
      }}
    >
      <CertificateView config={defaultCertificateConfig} />
    </WidgetHostProvider>,
  );
  expect(await screen.findByText(expected)).toBeTruthy();
});

it('shows an error when the initial source request fails', async () => {
  const t = (key: string) => en[key as keyof typeof en] ?? key;
  render(
    <WidgetHostProvider
      value={{
        locale: 'en',
        t,
        monitoring: {
          readCertificates: vi.fn().mockRejectedValue(new Error('unavailable')),
          readSummary: vi.fn(),
          readScopes: vi.fn(),
        },
      }}
    >
      <CertificateView config={defaultCertificateConfig} />
    </WidgetHostProvider>,
  );
  expect((await screen.findByRole('alert')).textContent).toBe(en['certificate.error']);
});
