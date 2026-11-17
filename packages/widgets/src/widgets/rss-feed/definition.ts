import { defineWidget } from '../../index.js';

export const MAX_FEED_URL_LENGTH = 2048;
export const MAX_FEED_TITLE_LENGTH = 80;
export const DEFAULT_FEED_LIMIT = 5;
export const MAX_FEED_LIMIT = 10;

export type RssFeedConfig = {
  feedUrl: string;
  title: string;
  limit: number;
  allowPrivateNetwork: boolean;
};

export const defaultRssFeedConfig: RssFeedConfig = {
  feedUrl: '',
  title: '',
  limit: DEFAULT_FEED_LIMIT,
  allowPrivateNetwork: false,
};

/** Validate and normalize an HTTP(S) feed URL without embedded credentials or fragments. */
export function parseFeedUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_FEED_URL_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password || url.hash) return null;
  return url.toString();
}

export const widgetRssFeedWidget = defineWidget<RssFeedConfig>({
  type: 'rss-feed',
  version: 1,
  locations: ['page'],
  sizes: ['normal', 'wide'],
  source: null,
  portable: true,
  defaultConfig: defaultRssFeedConfig,
  parseConfig(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const config = value as Record<string, unknown>;
    if (
      Object.keys(config).some(
        (key) => !['feedUrl', 'title', 'limit', 'allowPrivateNetwork'].includes(key),
      )
    )
      return null;
    const feedUrl = parseFeedUrl(config.feedUrl);
    if (!feedUrl) return null;
    if (config.title !== undefined && typeof config.title !== 'string') return null;
    const title = typeof config.title === 'string' ? config.title.trim() : '';
    if (title.length > MAX_FEED_TITLE_LENGTH) return null;
    if (
      typeof config.limit !== 'number' ||
      !Number.isInteger(config.limit) ||
      config.limit < 1 ||
      config.limit > MAX_FEED_LIMIT
    )
      return null;
    if (typeof config.allowPrivateNetwork !== 'boolean') return null;
    return {
      feedUrl,
      title,
      limit: config.limit,
      allowPrivateNetwork: config.allowPrivateNetwork,
    };
  },
});
