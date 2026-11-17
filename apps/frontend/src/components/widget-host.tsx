import { createContext, useContext, type ReactNode } from 'react';
import {
  FeedSourceError,
  WidgetHostProvider,
  type FeedData,
  type FeedQuery,
  type WidgetHost as Host,
  type MonitoringQuery,
} from '@homora/widgets/ui';
import { tOr, useI18n } from '@/i18n';
import type { MonitoringIncidents } from '@homora/widgets';
import { parseWidgetMonitoringSource } from '@/hooks/use-widget-monitoring-source';
import type { MonitoringProblemsQuery } from '@homora/widgets/ui';

async function getJson(path: string, signal: AbortSignal) {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error('Monitoring source failed');
  return response.json();
}
async function readSummary(groups: number[], pages: number[], signal: AbortSignal) {
  const query = new URLSearchParams();
  if (groups.length > 0) query.set('groups', groups.join(','));
  if (pages.length > 0) query.set('pages', pages.join(','));
  return getJson(`/api/widget-sources/monitoring/summary?${query}`, signal);
}
async function readScopes(signal: AbortSignal) {
  const [groups, pages] = await Promise.all([
    getJson('/api/groups', signal),
    getJson('/api/pages', signal),
  ]);
  return { groups, pages };
}

export async function readIncidents(
  options: MonitoringQuery,
  signal: AbortSignal,
): Promise<MonitoringIncidents> {
  const query = new URLSearchParams({
    days: String(options.days),
    limit: String(options.limit),
    minimumMinutes: String(options.minimumMinutes),
  });
  if (options.groups.length > 0) query.set('groups', JSON.stringify(options.groups));
  if (options.pages.length > 0) query.set('pages', JSON.stringify(options.pages));
  return getJson(`/api/widget-sources/monitoring/incidents?${query}`, signal);
}

export async function readProblems(query: MonitoringProblemsQuery, signal: AbortSignal) {
  const params = new URLSearchParams({
    limit: String(query.limit),
    includeDegraded: String(query.includeDegraded),
  });
  if (query.groups.length > 0 || query.pages.length > 0) {
    const scopes = (await readScopes(signal)) as {
      groups: { id: number; name: string }[];
      pages: { id: number; name: string }[];
    };
    for (const key of ['groups', 'pages'] as const) {
      if (query[key].length === 0) continue;
      const ids = scopes[key]
        .filter((item) => query[key].includes(item.name))
        .map((item) => item.id);
      params.set(key, ids.length > 0 ? ids.join(',') : '0');
    }
  }
  return parseWidgetMonitoringSource(
    await getJson(`/api/widget-sources/monitoring/problems?${params}`, signal),
  );
}

export async function readFeed(query: FeedQuery, signal: AbortSignal): Promise<FeedData> {
  const params = new URLSearchParams({
    url: query.feedUrl,
    limit: String(query.limit),
    allowPrivateNetwork: String(query.allowPrivateNetwork),
  });
  const response = await fetch(`/api/widget-sources/feed?${params}`, { signal });
  if (!response.ok) {
    if (response.status === 403) {
      throw new FeedSourceError('policy-blocked', 'Feed blocked by network policy');
    }
    throw new FeedSourceError('fetch-failed', 'Feed source failed');
  }
  return response.json() as Promise<FeedData>;
}

type FilterStatus = NonNullable<NonNullable<Host['monitoring']>['filterStatus']>;
export const WidgetStatusFilterContext = createContext<FilterStatus | undefined>(undefined);

export function WidgetHost({
  children,
  ...options
}: { children: ReactNode } & Partial<
  Pick<Host, 'openMonitor' | 'groups' | 'pages' | 'wide' | 'incidentReading'>
>) {
  const { locale } = useI18n();
  const filterStatus = useContext(WidgetStatusFilterContext);
  return (
    <WidgetHostProvider
      value={{
        locale,
        t: (key, params) => tOr(key, key, params),
        ...options,
        monitoring: {
          readSummary,
          readScopes,
          readProblems,
          filterStatus,
        },
        readFeed,
      }}
    >
      {children}
    </WidgetHostProvider>
  );
}
