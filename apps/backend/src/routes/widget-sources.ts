import type { FastifyInstance } from 'fastify';
import {
  SourceInvalidQueryError,
  SourceParseError,
  SourcePolicyBlockedError,
  type RestrictedFetch,
  type WidgetSourceContext,
  type WidgetSourceReader,
} from '@homora/widgets';
import { getWidgetSource } from '@homora/widgets/source-registry';
import { errorBody } from '../api-error.js';
import { getAuthorizedResponse, type RequestOptions } from '../network-request.js';
import type { DestinationPolicy } from '../network-policy.js';

const MAX_SOURCE_TIMEOUT_MS = 8000;
const MAX_SOURCE_BODY_BYTES = 512 * 1024;
const DEFAULT_CACHE_MAX_ENTRIES = 64;

type CacheEntry = {
  value: unknown;
  fetchedAt: number;
  tags: readonly string[];
};

export type SourceFetcher = (
  destination: string,
  policy: DestinationPolicy,
  options?: RequestOptions,
) => Promise<{ status: number; body: string }>;
export type IntegrationWidgetQuery = (
  connectionId: number,
  operation: string,
  params: unknown,
) => Promise<unknown>;

/**
 * Generic widget source host: handles authentication (via app hook), caching,
 * concurrent request deduplication, stale fallback, and restricted transport injection.
 */
export function registerWidgetSourceRoutes(
  app: FastifyInstance,
  fetchImpl: SourceFetcher = getAuthorizedResponse,
  now: () => number = Date.now,
  resolveSource: (
    contract: string,
  ) => WidgetSourceReader<unknown, unknown> | undefined = getWidgetSource,
  readIntegration?: IntegrationWidgetQuery,
) {
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<unknown>>();
  const tagGenerations = new Map<string, number>();
  const generationFor = (tags: readonly string[]) =>
    JSON.stringify(tags.map((tag) => [tag, tagGenerations.get(tag) ?? 0]));

  const setCache = (key: string, value: CacheEntry, maxEntries: number) => {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, value);
    if (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
  };

  const restrictedFetch: RestrictedFetch = async (destination, options) => {
    let url: URL;
    try {
      url = new URL(destination);
    } catch {
      throw new SourcePolicyBlockedError('invalid-destination');
    }
    const timeoutMs = Math.min(
      MAX_SOURCE_TIMEOUT_MS,
      Math.max(100, options.timeoutMs ?? MAX_SOURCE_TIMEOUT_MS),
    );
    const maxBodyBytes = Math.min(
      MAX_SOURCE_BODY_BYTES,
      Math.max(1, options.maxBodyBytes ?? MAX_SOURCE_BODY_BYTES),
    );
    try {
      return await fetchImpl(
        destination,
        { origins: [url.origin], allowPrivate: options.allowPrivate },
        { timeoutMs, maxBodyBytes, headers: options.headers },
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
        throw new SourcePolicyBlockedError('destination-disallowed', 'Destination disallowed.');
      }
      throw error;
    }
  };

  const context: WidgetSourceContext = {
    fetch: restrictedFetch,
    now,
    ...(readIntegration ? { readIntegration } : {}),
  };

  app.get<{ Params: { contract: string }; Querystring: Record<string, string> }>(
    '/api/widget-sources/:contract',
    async (request, reply) => {
      const reader = resolveSource(request.params.contract);
      if (!reader) return reply.code(404).send(errorBody('not-found'));

      const parsed = reader.parseQuery(request.query);
      if (!parsed) return reply.code(400).send(errorBody('invalid-query'));

      const ttlMs = reader.cacheTtlMs ?? 0;
      const maxEntries = reader.maxCacheEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
      const tags = parsed.cacheTags ?? [];
      const generation = generationFor(tags);
      const fullKey = `${reader.contract}\0${generation}\0${parsed.cacheKey}`;
      const existing = ttlMs > 0 ? cache.get(fullKey) : undefined;
      const project = (value: unknown) =>
        reader.project ? reader.project(value, parsed.params) : value;

      if (existing && now() - existing.fetchedAt < ttlMs) {
        return project(existing.value);
      }

      let pending = inFlight.get(fullKey);
      if (!pending) {
        pending = (async () => {
          try {
            const value = await reader.read(parsed.params, context);
            if (generationFor(tags) !== generation) throw new Error('Widget source invalidated.');
            if (ttlMs > 0) {
              setCache(fullKey, { value, fetchedAt: now(), tags }, maxEntries);
            }
            return value;
          } finally {
            if (inFlight.get(fullKey) === pending) inFlight.delete(fullKey);
          }
        })();
        inFlight.set(fullKey, pending);
      }

      try {
        const fresh = await pending;
        return project(fresh);
      } catch (error) {
        if (error instanceof SourcePolicyBlockedError) {
          cache.delete(fullKey);
          return reply.code(403).send({
            ...errorBody('policy-blocked'),
            reason: error.reason,
          });
        }
        if (error instanceof SourceInvalidQueryError) {
          return reply.code(400).send(errorBody('invalid-query'));
        }
        if (existing && cache.get(fullKey) === existing && generationFor(tags) === generation) {
          const projected = project(existing.value);
          return typeof projected === 'object' && projected !== null
            ? { ...projected, stale: true }
            : projected;
        }
        if (error instanceof SourceParseError) {
          return reply.code(502).send(errorBody('feed-parse-failed'));
        }
        return reply.code(502).send(errorBody('feed-fetch-failed'));
      }
    },
  );
  return {
    invalidateIntegration(connectionId: number) {
      const tag = `integration:${connectionId}`;
      tagGenerations.set(tag, (tagGenerations.get(tag) ?? 0) + 1);
      for (const [key, entry] of cache) {
        if (entry.tags.includes(tag)) cache.delete(key);
      }
    },
  };
}
