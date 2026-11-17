// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetHostProvider, WidgetSourceError } from '../../../ui/host.js';
import { defaultPublicIpConfig, type PublicIpConfig } from '../definition.js';
import type { PublicIpSourceResult } from '../source.js';
import { Editor, PublicIpContent, PublicIpView, widgetUI } from './index.js';

afterEach(cleanup);

function renderWithHost(
  ui: React.ReactNode,
  options: {
    readSource?: (
      contract: string,
      params: unknown,
      signal: AbortSignal,
    ) => Promise<PublicIpSourceResult>;
  } = {},
) {
  return render(
    <WidgetHostProvider
      value={{
        locale: 'en-US',
        readSource: options.readSource as never,
        t: (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key),
      }}
    >
      {ui}
    </WidgetHostProvider>,
  );
}

describe('public-ip UI', () => {
  it('does not call readSource when opt-in is pending and renders pending, loading, policy-blocked, and error states', () => {
    const readSource = vi.fn();
    renderWithHost(<PublicIpView config={defaultPublicIpConfig} />, { readSource });
    expect(screen.getByText('publicIpWidget.optInPending')).toBeTruthy();
    expect(readSource).not.toHaveBeenCalled();

    cleanup();
    renderWithHost(
      <PublicIpContent config={defaultPublicIpConfig} reading={{ status: 'loading' }} />,
    );
    expect(screen.getByRole('status')).toBeTruthy();

    cleanup();
    const refresh = vi.fn();
    renderWithHost(
      <PublicIpContent
        config={defaultPublicIpConfig}
        reading={{ status: 'policy-blocked', refresh }}
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('publicIpWidget.policyBlocked');
    fireEvent.click(screen.getByRole('button', { name: 'publicIpWidget.refresh' }));
    expect(refresh).toHaveBeenCalledTimes(1);

    cleanup();
    renderWithHost(
      <PublicIpContent config={defaultPublicIpConfig} reading={{ status: 'error', refresh }} />,
    );
    expect(screen.getByRole('alert').textContent).toBe('publicIpWidget.error');
  });

  it('masks by default, supports reveal/copy, stale indicator, IPv6 unavailable, and manual refresh', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const config: PublicIpConfig = {
      provider: 'ipify',
      addressFamily: 'both',
      optIn: true,
      maskByDefault: true,
    };
    const readSource = vi
      .fn()
      .mockResolvedValueOnce({
        provider: 'ipify',
        addressFamily: 'both',
        ipv4: '203.0.113.5',
        ipv6: null,
        ipv6Unavailable: true,
        fetchedAt: Date.UTC(2026, 10, 17, 12, 0),
        stale: true,
      })
      .mockResolvedValueOnce({
        provider: 'ipify',
        addressFamily: 'both',
        ipv4: '203.0.113.6',
        ipv6: '2001:db8::1',
        ipv6Unavailable: false,
        fetchedAt: Date.UTC(2026, 10, 17, 12, 5),
        stale: false,
      });

    renderWithHost(<PublicIpView config={config} />, { readSource });

    await waitFor(() => expect(screen.getByText('ipify')).toBeTruthy());
    expect(screen.getByRole('status').textContent).toBe('publicIpWidget.stale');
    expect(screen.getByText('•••.•••.•••.•••')).toBeTruthy();
    expect(screen.queryByText('203.0.113.5')).toBeNull();
    expect(screen.getByText('publicIpWidget.unavailable')).toBeTruthy();

    // Copy works even while masked
    fireEvent.click(screen.getByRole('button', { name: 'publicIpWidget.copyIpv4' }));
    expect(writeText).toHaveBeenCalledWith('203.0.113.5');

    // Reveal shows the actual IP
    const revealBtn = screen.getByRole('button', { name: 'publicIpWidget.reveal' });
    expect(revealBtn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(revealBtn);
    expect(screen.getByText('203.0.113.5')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'publicIpWidget.hide' }).getAttribute('aria-pressed'),
    ).toBe('true');

    // Manual refresh triggers another readSource call
    fireEvent.click(screen.getByRole('button', { name: 'publicIpWidget.refresh' }));
    await waitFor(() => expect(screen.getByText('203.0.113.6')).toBeTruthy());
    expect(screen.getByText('2001:db8::1')).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it('shows policy-blocked when readSource rejects with WidgetSourceError(policy-blocked)', async () => {
    const readSource = vi
      .fn()
      .mockRejectedValue(new WidgetSourceError('policy-blocked', 'Blocked'));
    renderWithHost(<PublicIpView config={{ ...defaultPublicIpConfig, optIn: true }} />, {
      readSource,
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('publicIpWidget.policyBlocked'),
    );
  });

  it('edits configuration and validates canSubmit', () => {
    const onChange = vi.fn();
    renderWithHost(<Editor config={defaultPublicIpConfig} onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /publicIpWidget\.optIn/ }));
    expect(onChange).toHaveBeenCalledWith({
      ...defaultPublicIpConfig,
      optIn: true,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /publicIpWidget\.maskByDefault/ }));
    expect(onChange).toHaveBeenCalledWith({
      ...defaultPublicIpConfig,
      maskByDefault: false,
    });

    expect(widgetUI.canSubmit?.(defaultPublicIpConfig)).toBe(true);
    expect(widgetUI.canSubmit?.({ provider: 'bad' })).toBe(false);
  });
});
