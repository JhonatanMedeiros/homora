// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetHostProvider, WidgetSourceError } from '../../../ui/host.js';
import { defaultDomainExpiryConfig, type DomainExpiryConfig } from '../definition.js';
import type { DomainExpirySourceResult } from '../source.js';
import { DomainExpiryContent, DomainExpiryView, Editor, widgetUI } from './index.js';

afterEach(cleanup);

function renderWithHost(
  ui: React.ReactNode,
  options: {
    wide?: boolean;
    readSource?: (
      contract: string,
      params: unknown,
      signal: AbortSignal,
    ) => Promise<DomainExpirySourceResult>;
  } = {},
) {
  return render(
    <WidgetHostProvider
      value={{
        locale: 'en-US',
        wide: options.wide,
        readSource: options.readSource as never,
        t: (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key),
      }}
    >
      {ui}
    </WidgetHostProvider>,
  );
}

describe('domain-expiry UI', () => {
  it('renders unconfigured, loading, policy-blocked, and error states', () => {
    renderWithHost(
      <DomainExpiryContent
        config={defaultDomainExpiryConfig}
        reading={{ status: 'unconfigured' }}
      />,
    );
    expect(screen.getByText('domainExpiryWidget.unconfigured')).toBeTruthy();
    expect(screen.getByText('domainExpiryWidget.sourceLabel')).toBeTruthy();

    cleanup();
    renderWithHost(
      <DomainExpiryContent config={defaultDomainExpiryConfig} reading={{ status: 'loading' }} />,
    );
    expect(screen.getByRole('status')).toBeTruthy();

    cleanup();
    renderWithHost(
      <DomainExpiryContent
        config={defaultDomainExpiryConfig}
        reading={{ status: 'policy-blocked' }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('domainExpiryWidget.policyBlocked');

    cleanup();
    renderWithHost(
      <DomainExpiryContent config={defaultDomainExpiryConfig} reading={{ status: 'error' }} />,
    );
    expect(screen.getByRole('alert').textContent).toBe('domainExpiryWidget.error');
  });

  it('distinguishes active, expiring soon, expired, unknown, and per-domain error states with RDAP label', () => {
    const now = Date.UTC(2026, 10, 17, 12, 0);
    const dayMs = 86_400_000;
    const config: DomainExpiryConfig = {
      title: 'Production Domains',
      domains: ['ok.com', 'soon.com', 'expired.com', 'unknown.org', 'broken.net'],
      warnDays: 30,
    };

    renderWithHost(
      <DomainExpiryContent
        config={config}
        now={now}
        reading={{
          status: 'ready',
          stale: true,
          data: {
            fetchedAt: now,
            stale: true,
            domains: [
              { domain: 'ok.com', status: 'ok', expiresAt: now + 90 * dayMs },
              { domain: 'soon.com', status: 'ok', expiresAt: now + 10 * dayMs },
              { domain: 'expired.com', status: 'ok', expiresAt: now - 3 * dayMs },
              { domain: 'unknown.org', status: 'unknown', expiresAt: null },
              { domain: 'broken.net', status: 'error', expiresAt: null },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText('Production Domains')).toBeTruthy();
    expect(screen.getByText('domainExpiryWidget.sourceLabel')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('domainExpiryWidget.stale');
    expect(screen.getByText('domainExpiryWidget.statusOk')).toBeTruthy();
    expect(screen.getByText('domainExpiryWidget.statusSoon')).toBeTruthy();
    expect(screen.getByText('domainExpiryWidget.statusExpired')).toBeTruthy();
    expect(screen.getByText('domainExpiryWidget.statusUnknown')).toBeTruthy();
    expect(screen.getByText('domainExpiryWidget.statusError')).toBeTruthy();
  });

  it('fetches via readSource in DomainExpiryView and handles policy-blocked errors', async () => {
    const readSource = vi.fn().mockRejectedValueOnce(new WidgetSourceError('policy-blocked', 'No'));
    renderWithHost(
      <DomainExpiryView config={{ title: '', domains: ['example.com'], warnDays: 30 }} />,
      { wide: true, readSource },
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('domainExpiryWidget.policyBlocked');
    });
    expect(readSource).toHaveBeenCalledWith(
      'domain-expiry',
      { domains: 'example.com' },
      expect.any(AbortSignal),
    );
  });

  it('supports editing domains, warnDays, and canSubmit validation', () => {
    expect(widgetUI.canSubmit?.(defaultDomainExpiryConfig)).toBe(false);
    expect(
      widgetUI.canSubmit?.({
        title: '',
        domains: ['example.com'],
        warnDays: 30,
      }),
    ).toBe(true);

    const onChange = vi.fn();
    renderWithHost(<Editor config={defaultDomainExpiryConfig} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('domainExpiryWidget.domains:5'), {
      target: { value: 'example.com' },
    });
    expect(onChange).toHaveBeenCalledWith({
      title: '',
      domains: ['example.com'],
      warnDays: 30,
    });
  });
});
