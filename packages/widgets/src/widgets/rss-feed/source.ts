import {
  SourceParseError,
  SourcePolicyBlockedError,
  type WidgetSourceReader,
} from '../../source.js';
import { DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT, MAX_FEED_URL_LENGTH } from './definition.js';
import { FeedParseError, MAX_FEED_BYTES, parseFeedXml, type ParsedFeedEntry } from './parser.js';

export type FeedSourceParams = {
  url: URL;
  limit: number;
  allowPrivateNetwork: boolean;
};

export type FeedSourceResult = {
  feedTitle: string | null;
  entries: ParsedFeedEntry[];
  fetchedAt: number;
  stale: boolean;
};

const FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const FEED_CACHE_MAX_ENTRIES = 64;
const FEED_TIMEOUT_MS = 8000;

export const rssFeedSource: WidgetSourceReader<FeedSourceParams, FeedSourceResult> = {
  contract: 'feed',
  cacheTtlMs: FEED_CACHE_TTL_MS,
  maxCacheEntries: FEED_CACHE_MAX_ENTRIES,

  parseQuery(query) {
    const rawUrl = typeof query.url === 'string' ? query.url.trim() : '';
    if (!rawUrl || rawUrl.length > MAX_FEED_URL_LENGTH) return null;

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (!['http:', 'https:'].includes(url.protocol)) return null;

    const rawLimit = query.limit;
    let limit = DEFAULT_FEED_LIMIT;
    if (rawLimit !== undefined) {
      if (!/^\d+$/.test(rawLimit)) return null;
      limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_FEED_LIMIT) return null;
    }

    const rawAllow = query.allowPrivateNetwork;
    if (rawAllow !== undefined && rawAllow !== 'true' && rawAllow !== 'false') return null;
    const allowPrivateNetwork = rawAllow === 'true';

    return {
      cacheKey: `${url.toString()}\0${allowPrivateNetwork ? '1' : '0'}`,
      params: { url, limit, allowPrivateNetwork },
    };
  },

  async read(params, context) {
    const { url, allowPrivateNetwork } = params;
    if (url.username || url.password || url.hash) {
      throw new SourcePolicyBlockedError('credentials-not-allowed');
    }
    if (!allowPrivateNetwork && url.protocol !== 'https:') {
      throw new SourcePolicyBlockedError('https-required');
    }

    const response = await context.fetch(url.toString(), {
      allowPrivate: allowPrivateNetwork,
      timeoutMs: FEED_TIMEOUT_MS,
      maxBodyBytes: MAX_FEED_BYTES,
      headers: {
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
      },
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }

    try {
      const feed = parseFeedXml(response.body, MAX_FEED_LIMIT);
      return {
        feedTitle: feed.feedTitle,
        entries: feed.entries,
        fetchedAt: context.now(),
        stale: false,
      };
    } catch (error) {
      if (error instanceof FeedParseError) {
        throw new SourceParseError(error.message);
      }
      throw error;
    }
  },

  project(cached, params) {
    return {
      ...cached,
      entries: cached.entries.slice(0, params.limit),
    };
  },
};
