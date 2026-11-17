import { describe, expect, it } from 'vitest';
import { isPortableWidget } from '../../index.js';
import { defaultRssFeedConfig, parseFeedUrl, widgetRssFeedWidget } from './definition.js';

describe('rss-feed widget', () => {
  it('accepts valid configurations and normalizes optional fields', () => {
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: ' https://example.com/feed.xml ',
        title: '  Homelab News  ',
        limit: 5,
        allowPrivateNetwork: false,
      }),
    ).toEqual({
      feedUrl: 'https://example.com/feed.xml',
      title: 'Homelab News',
      limit: 5,
      allowPrivateNetwork: false,
    });

    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'http://192.168.1.10:8080/atom.xml',
        limit: 10,
        allowPrivateNetwork: true,
      }),
    ).toEqual({
      feedUrl: 'http://192.168.1.10:8080/atom.xml',
      title: '',
      limit: 10,
      allowPrivateNetwork: true,
    });
  });

  it('declares normal and wide sizes, version 1, and portability', () => {
    expect(widgetRssFeedWidget.version).toBe(1);
    expect(widgetRssFeedWidget.sizes).toEqual(['normal', 'wide']);
    expect(widgetRssFeedWidget.source).toBeNull();
    expect(isPortableWidget(widgetRssFeedWidget)).toBe(true);
  });

  it('rejects invalid URLs, credentials, limits, and unknown fields', () => {
    expect(widgetRssFeedWidget.parseConfig(defaultRssFeedConfig)).toBeNull();
    expect(widgetRssFeedWidget.parseConfig(null)).toBeNull();
    expect(widgetRssFeedWidget.parseConfig([])).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'https://user:pass@example.com/feed.xml',
        title: '',
        limit: 5,
        allowPrivateNetwork: false,
      }),
    ).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'ftp://example.com/feed.xml',
        title: '',
        limit: 5,
        allowPrivateNetwork: false,
      }),
    ).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'https://example.com/feed.xml#section',
        title: '',
        limit: 5,
        allowPrivateNetwork: false,
      }),
    ).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'https://example.com/feed.xml',
        title: 'a'.repeat(81),
        limit: 5,
        allowPrivateNetwork: false,
      }),
    ).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'https://example.com/feed.xml',
        title: '',
        limit: 11,
        allowPrivateNetwork: false,
      }),
    ).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'https://example.com/feed.xml',
        title: '',
        limit: 0,
        allowPrivateNetwork: false,
      }),
    ).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'https://example.com/feed.xml',
        title: '',
        limit: 5,
        allowPrivateNetwork: 'false',
      }),
    ).toBeNull();
    expect(
      widgetRssFeedWidget.parseConfig({
        feedUrl: 'https://example.com/feed.xml',
        title: '',
        limit: 5,
        allowPrivateNetwork: false,
        extra: true,
      }),
    ).toBeNull();
    expect(parseFeedUrl('javascript:alert(1)')).toBeNull();
  });
});
