// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedSourceError, WidgetHostProvider, type FeedData } from '../../../ui/host.js';
import { defaultRssFeedConfig, type RssFeedConfig } from '../definition.js';
import { Editor, RssFeedContent, RssFeedView, widgetUI } from './index.js';

afterEach(cleanup);

function renderWithHost(
  ui: React.ReactNode,
  options: {
    wide?: boolean;
    readFeed?: (query: unknown, signal: AbortSignal) => Promise<FeedData>;
  } = {},
) {
  return render(
    <WidgetHostProvider
      value={{
        locale: 'en-US',
        wide: options.wide,
        readFeed: options.readFeed as never,
        t: (key, params) => (params ? `${key}:${Object.values(params).join(',')}` : key),
      }}
    >
      {ui}
    </WidgetHostProvider>,
  );
}

describe('rss-feed UI', () => {
  it('renders unconfigured, loading, empty, policy-blocked, and error states', () => {
    renderWithHost(
      <RssFeedContent config={defaultRssFeedConfig} reading={{ status: 'unconfigured' }} />,
    );
    expect(screen.getByText('rssWidget.unconfigured')).toBeTruthy();

    cleanup();
    renderWithHost(
      <RssFeedContent config={defaultRssFeedConfig} reading={{ status: 'loading' }} />,
    );
    expect(screen.getByRole('status')).toBeTruthy();

    cleanup();
    renderWithHost(
      <RssFeedContent config={defaultRssFeedConfig} reading={{ status: 'policy-blocked' }} />,
    );
    expect(screen.getByRole('alert').textContent).toBe('rssWidget.policyBlocked');

    cleanup();
    renderWithHost(<RssFeedContent config={defaultRssFeedConfig} reading={{ status: 'error' }} />);
    expect(screen.getByRole('alert').textContent).toBe('rssWidget.error');

    cleanup();
    renderWithHost(
      <RssFeedContent
        config={{ ...defaultRssFeedConfig, feedUrl: 'https://example.com/feed.xml' }}
        reading={{
          status: 'ready',
          stale: false,
          data: { feedTitle: 'Example', entries: [], fetchedAt: 1000, stale: false },
        }}
      />,
    );
    expect(screen.getByText('rssWidget.empty')).toBeTruthy();
  });

  it('renders entries with safe links, localized dates, and stale-cache indicator', async () => {
    const config: RssFeedConfig = {
      feedUrl: 'https://example.com/feed.xml',
      title: '',
      limit: 5,
      allowPrivateNetwork: false,
    };
    const readFeed = vi.fn().mockResolvedValueOnce({
      feedTitle: 'Homelab Blog',
      fetchedAt: Date.UTC(2026, 10, 17, 12, 0),
      stale: true,
      entries: [
        {
          id: '1',
          title: 'Release v2.0',
          link: 'https://example.com/v2',
          publishedAt: Date.UTC(2026, 10, 17, 11, 0),
        },
        {
          id: '2',
          title: 'Text Only Entry',
          link: null,
          publishedAt: null,
        },
      ],
    });

    renderWithHost(<RssFeedView config={config} />, { wide: true, readFeed });

    await waitFor(() => expect(screen.getByText('Release v2.0')).toBeTruthy());
    expect(screen.getByText('Homelab Blog')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('rssWidget.stale');

    const link = screen.getByRole('link', { name: /Release v2.0/ });
    expect(link.getAttribute('href')).toBe('https://example.com/v2');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');

    expect(screen.getByText('Text Only Entry')).toBeTruthy();
    expect(screen.getByText('rssWidget.noDate')).toBeTruthy();
  });

  it('shows policy-blocked state when readFeed throws FeedSourceError(policy-blocked)', async () => {
    const readFeed = vi.fn().mockRejectedValue(new FeedSourceError('policy-blocked', 'Blocked'));
    renderWithHost(
      <RssFeedView
        config={{
          feedUrl: 'http://192.168.1.5/feed.xml',
          title: '',
          limit: 5,
          allowPrivateNetwork: false,
        }}
      />,
      { readFeed },
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('rssWidget.policyBlocked'),
    );
  });

  it('edits configuration and gates submit on valid config', () => {
    const onChange = vi.fn();
    renderWithHost(<Editor config={defaultRssFeedConfig} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('rssWidget.feedUrl'), {
      target: { value: 'https://example.com/rss.xml' },
    });
    expect(onChange).toHaveBeenCalledWith({
      ...defaultRssFeedConfig,
      feedUrl: 'https://example.com/rss.xml',
    });

    expect(widgetUI.canSubmit?.(defaultRssFeedConfig)).toBe(false);
    expect(
      widgetUI.canSubmit?.({
        ...defaultRssFeedConfig,
        feedUrl: 'https://example.com/rss.xml',
      }),
    ).toBe(true);
  });
});
