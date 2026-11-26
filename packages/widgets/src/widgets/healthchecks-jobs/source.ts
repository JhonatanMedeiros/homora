import { SourceParseError, type WidgetSourceReader } from '../../source.js';

export type Job = {
  name: string;
  status: 'up' | 'down' | 'grace' | 'new' | 'paused' | 'unknown';
  lastPing: string | null;
};
export type JobsResult = { checks: Job[]; total: number; fetchedAt: number; stale: boolean };
type Params = { connectionId: number };
const statuses = new Set(['up', 'down', 'grace', 'new', 'paused', 'unknown']);

export const healthchecksJobsSource: WidgetSourceReader<Params, JobsResult> = {
  contract: 'healthchecks-jobs',
  cacheTtlMs: 30_000,
  maxCacheEntries: 64,
  parseQuery(query) {
    if (
      Object.keys(query).some((key) => key !== 'connectionId') ||
      !/^[1-9]\d*$/.test(query.connectionId ?? '')
    )
      return null;
    const connectionId = Number(query.connectionId);
    if (!Number.isSafeInteger(connectionId)) return null;
    return {
      cacheKey: String(connectionId),
      cacheTags: [`integration:${connectionId}`],
      params: { connectionId },
    };
  },
  async read(params, context) {
    if (!context.readIntegration) throw new Error('Integration query host unavailable.');
    const raw = await context.readIntegration(params.connectionId, 'job-checks', {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SourceParseError();
    const data = raw as Record<string, unknown>;
    if (
      !Array.isArray(data.checks) ||
      data.checks.length > 50 ||
      !Number.isSafeInteger(data.total) ||
      (data.total as number) < data.checks.length ||
      typeof data.fetchedAt !== 'number' ||
      !Number.isFinite(new Date(data.fetchedAt).getTime()) ||
      typeof data.stale !== 'boolean'
    )
      throw new SourceParseError();
    const checks: Job[] = data.checks.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SourceParseError();
      const item = raw as Record<string, unknown>;
      if (
        typeof item.name !== 'string' ||
        item.name.length > 256 ||
        typeof item.status !== 'string' ||
        !statuses.has(item.status) ||
        (item.lastPing !== null &&
          (typeof item.lastPing !== 'string' ||
            item.lastPing.length > 128 ||
            !Number.isFinite(Date.parse(item.lastPing))))
      )
        throw new SourceParseError();
      return {
        name: item.name,
        status: item.status as Job['status'],
        lastPing: item.lastPing as string | null,
      };
    });
    return { checks, total: data.total as number, fetchedAt: data.fetchedAt, stale: false };
  },
};
