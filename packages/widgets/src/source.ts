export type RestrictedFetchOptions = {
  allowPrivate: boolean;
  timeoutMs?: number;
  maxBodyBytes?: number;
  headers?: Readonly<Record<string, string>>;
};

export type RestrictedFetch = (
  destination: string,
  options: RestrictedFetchOptions,
) => Promise<{ status: number; body: string }>;

export type WidgetSourceContext = {
  fetch: RestrictedFetch;
  now: () => number;
  readIntegration?: (connectionId: number, operation: string, params: unknown) => Promise<unknown>;
};

export class SourcePolicyBlockedError extends Error {
  reason: string;
  constructor(reason: string, message = 'Blocked by network policy.') {
    super(message);
    this.name = 'SourcePolicyBlockedError';
    this.reason = reason;
  }
}

export class SourceInvalidQueryError extends Error {
  constructor(message = 'Invalid query.') {
    super(message);
    this.name = 'SourceInvalidQueryError';
  }
}

export class SourceParseError extends Error {
  constructor(message = 'Could not parse source response.') {
    super(message);
    this.name = 'SourceParseError';
  }
}

export type ParsedSourceQuery<Params = unknown> = {
  /** Canonical key identifying the upstream fetch (excluding view-only params like limit). */
  cacheKey: string;
  params: Params;
};

export type WidgetSourceReader<Params = unknown, Result = unknown> = {
  contract: string;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  parseQuery(query: Record<string, string>): ParsedSourceQuery<Params> | null;
  read(params: Params, context: WidgetSourceContext): Promise<Result>;
  /** Optional projection when returning a cached value for different view-only params (e.g. limit). */
  project?(cached: Result, params: Params): Result;
};
