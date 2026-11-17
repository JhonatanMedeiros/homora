import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  FeedParseError,
  MAX_FEED_BYTES,
  MAX_FEED_LIMIT,
  MAX_FEED_URL_LENGTH,
  parseFeedXml,
  type ParsedFeed,
} from '@homora/widgets';
import { errorBody } from '../api-error.js';
import { getAuthorizedResponse, type RequestOptions } from '../network-request.js';
import type { DestinationPolicy } from '../network-policy.js';

const querySchema = z
  .object({
    url: z.string().trim().min(1).max(MAX_FEED_URL_LENGTH),
    limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(5),
    allowPrivateNetwork: z.enum(['true', 'false']).default('false'),
  })
  .strict();

const FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const FEED_CACHE_MAX_ENTRIES = 64;
const FEED_TIMEOUT_MS = 8000;

type CachedFeed = {
  feed: ParsedFeed;
  fetchedAt: number;
};

class PolicyBlockedError extends Error {
  policyCode: string;
  constructor(policyCode: string, message: string) {
    super(message);
    this.name = 'PolicyBlockedError';
    this.policyCode = policyCode;
  }
}

export type FeedFetcher = (
  destination: string,
  policy: DestinationPolicy,
  options?: RequestOptions,
) => Promise<{ status: number; body: string }>;

/** Fetch, cache, deduplicate, and parse RSS 2.0 / Atom 1.0 feeds through the restricted transport. */
export function registerWidgetFeedRoutes(
  app: FastifyInstance,
  fetchFeed: FeedFetcher = getAuthorizedResponse,
  now: () => number = Date.now,
) {
  const cache = new Map<string, CachedFeed>();
  const inFlight = new Map<string, Promise<CachedFeed>>();

  const setCache = (key: string, value: CachedFeed) => {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    if (cache.size > FEED_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
  };

  app.get<{ Querystring: Record<string, string> }>(
    '/api/widget-sources/feed',
    async (request, reply) => {
      const parsedQuery = querySchema.safeParse(request.query);
      if (!parsedQuery.success) return reply.code(400).send(errorBody('invalid-query'));

      const allowPrivateNetwork = parsedQuery.data.allowPrivateNetwork === 'true';
      let url: URL;
      try {
        url = new URL(parsedQuery.data.url);
      } catch {
        return reply.code(400).send(errorBody('invalid-query'));
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        return reply.code(400).send(errorBody('invalid-query'));
      }
      if (url.username || url.password || url.hash) {
        return reply.code(403).send({
          ...errorBody('policy-blocked'),
          reason: 'credentials-not-allowed',
        });
      }
      if (!allowPrivateNetwork && url.protocol !== 'https:') {
        return reply.code(403).send({
          ...errorBody('policy-blocked'),
          reason: 'https-required',
        });
      }

      const normalizedUrl = url.toString();
      const cacheKey = `${normalizedUrl}\0${allowPrivateNetwork ? '1' : '0'}`;
      const currentTime = now();
      const existing = cache.get(cacheKey);

      if (existing && currentTime - existing.fetchedAt < FEED_CACHE_TTL_MS) {
        return {
          feedTitle: existing.feed.feedTitle,
          entries: existing.feed.entries.slice(0, parsedQuery.data.limit),
          fetchedAt: existing.fetchedAt,
          stale: false,
        };
      }

      let pending = inFlight.get(cacheKey);
      if (!pending) {
        pending = (async () => {
          try {
            let response: { status: number; body: string };
            try {
              response = await fetchFeed(
                normalizedUrl,
                { origins: [url.origin], allowPrivate: allowPrivateNetwork },
                {
                  timeoutMs: FEED_TIMEOUT_MS,
                  maxBodyBytes: MAX_FEED_BYTES,
                  headers: {
                    accept:
                      'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
                  },
                },
              );
            } catch (error) {
              const errCode =
                typeof error === 'object' && error !== null && 'code' in error
                  ? (error as { code?: unknown }).code
                  : undefined;
              const errMsg = error instanceof Error ? error.message : '';
              if (
                errCode === 'destination-disallowed' ||
                errMsg === 'Invalid destination.' ||
                errMsg === 'Unauthorized destination.'
              ) {
                throw new PolicyBlockedError('destination-disallowed', 'Destination disallowed.');
              }
              throw error;
            }

            if (response.status < 200 || response.status >= 300) {
              throw new Error(`HTTP ${response.status}`);
            }
            const feed = parseFeedXml(response.body, MAX_FEED_LIMIT);
            const fresh: CachedFeed = { feed, fetchedAt: now() };
            setCache(cacheKey, fresh);
            return fresh;
          } finally {
            if (inFlight.get(cacheKey) === pending) inFlight.delete(cacheKey);
          }
        })();
        inFlight.set(cacheKey, pending);
      }

      try {
        const fresh = await pending;
        return {
          feedTitle: fresh.feed.feedTitle,
          entries: fresh.feed.entries.slice(0, parsedQuery.data.limit),
          fetchedAt: fresh.fetchedAt,
          stale: false,
        };
      } catch (error) {
        if (error instanceof PolicyBlockedError) {
          cache.delete(cacheKey);
          return reply.code(403).send({
            ...errorBody('policy-blocked'),
            reason: error.policyCode,
          });
        }
        if (existing) {
          return {
            feedTitle: existing.feed.feedTitle,
            entries: existing.feed.entries.slice(0, parsedQuery.data.limit),
            fetchedAt: existing.fetchedAt,
            stale: true,
          };
        }
        if (error instanceof FeedParseError) {
          return reply.code(502).send(errorBody('feed-parse-failed'));
        }
        return reply.code(502).send(errorBody('feed-fetch-failed'));
      }
    },
  );
}
