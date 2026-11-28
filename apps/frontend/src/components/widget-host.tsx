import { createContext, useContext, type ReactNode } from 'react';
import {
  WeatherSourceError,
  WidgetHostProvider,
  WidgetSourceError,
  type WeatherHost,
  type WidgetHost as Host,
  type MonitoringQuery,
  type WidgetSourceParams,
} from '@homora/widgets/ui';
import { tOr, useI18n } from '@/i18n';
import type {
  MonitoringAvailability,
  MonitoringCertificates,
  MonitoringIncidents,
  MonitoringMaintenance,
  WeatherGeocodeResponse,
  WeatherObservation,
  WeatherProviderSummary,
} from '@homora/widgets';
import { parseWidgetMonitoringSource } from '@/hooks/use-widget-monitoring-source';
import type {
  MonitoringAvailabilityQuery,
  MonitoringProblemsQuery,
  MonitoringMaintenanceQuery,
  MonitoringTargetOption,
} from '@homora/widgets/ui';

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

async function readProbes(signal: AbortSignal) {
  return (await getJson('/api/probes', signal)) as { name: string }[];
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

export async function readMaintenance(
  query: MonitoringMaintenanceQuery,
  signal: AbortSignal,
): Promise<MonitoringMaintenance> {
  const params = new URLSearchParams({ days: String(query.days), limit: String(query.limit) });
  if (query.groups.length > 0) params.set('groups', JSON.stringify(query.groups));
  if (query.pages.length > 0) params.set('pages', JSON.stringify(query.pages));
  return getJson(`/api/widget-sources/monitoring/maintenance?${params}`, signal);
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

export async function readAvailability(
  query: MonitoringAvailabilityQuery,
  signal: AbortSignal,
): Promise<MonitoringAvailability> {
  const params = new URLSearchParams({
    target: query.target,
    range: query.range,
  });
  return getJson(`/api/widget-sources/monitoring/availability?${params}`, signal);
}

async function readCertificates(
  query: { pages: string[]; groups: string[] },
  signal: AbortSignal,
): Promise<MonitoringCertificates> {
  const params = new URLSearchParams({
    limit: '5',
    pages: JSON.stringify(query.pages),
    groups: JSON.stringify(query.groups),
  });
  return getJson(`/api/widget-sources/monitoring/certificates?${params}`, signal);
}

async function readTargets(signal: AbortSignal): Promise<MonitoringTargetOption[]> {
  const [services, probes] = await Promise.all([
    getJson('/api/services', signal) as Promise<{ name: string }[]>,
    getJson('/api/probes', signal) as Promise<{ name: string }[]>,
  ]);
  const seen = new Set<string>();
  const items: MonitoringTargetOption[] = [];
  for (const service of services) {
    if (!seen.has(service.name)) {
      seen.add(service.name);
      items.push({ name: service.name, isService: true });
    }
  }
  for (const probe of probes) {
    if (!seen.has(probe.name)) {
      seen.add(probe.name);
      items.push({ name: probe.name, isService: false });
    }
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

async function readLatency(query: { target: string; range: string }, signal: AbortSignal) {
  return getJson(`/api/widget-sources/monitoring/latency?${new URLSearchParams(query)}`, signal);
}
async function readServiceTargets(signal: AbortSignal) {
  return getJson('/api/widget-sources/monitoring/serviceTargets', signal);
}

export async function readWidgetSource<T = unknown>(
  contract: string,
  params: WidgetSourceParams,
  signal: AbortSignal,
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const qs = query.toString();
  const response = await fetch(
    `/api/widget-sources/${encodeURIComponent(contract)}${qs ? `?${qs}` : ''}`,
    { signal },
  );
  if (!response.ok) {
    if (response.status === 403) {
      throw new WidgetSourceError('policy-blocked', 'Blocked by network policy');
    }
    throw new WidgetSourceError('fetch-failed', 'Widget source failed');
  }
  return response.json() as Promise<T>;
}

type FilterStatus = NonNullable<NonNullable<Host['monitoring']>['filterStatus']>;
export const WidgetStatusFilterContext = createContext<FilterStatus | undefined>(undefined);

async function readWeatherError(response: Response): Promise<WeatherSourceError> {
  let code = '';
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') code = body.error;
  } catch {
    // Ignore non-JSON error payloads.
  }
  if (code === 'weather-provider-not-configured') {
    return new WeatherSourceError('provider-not-configured', 'Weather provider not configured');
  }
  if (code === 'weather-provider-auth-failed') {
    return new WeatherSourceError('provider-auth-failed', 'Weather provider authentication failed');
  }
  if (code === 'weather-rate-limited' || response.status === 429) {
    return new WeatherSourceError('rate-limited', 'Weather provider rate limited');
  }
  return new WeatherSourceError('provider-unavailable', 'Weather provider unavailable');
}

const weatherHost: WeatherHost = {
  async read(query, signal) {
    const params = new URLSearchParams({
      provider: query.provider,
      lat: String(query.latitude),
      lon: String(query.longitude),
      unit: query.unit,
    });
    const name = query.name?.trim();
    if (name) params.set('name', name);
    const response = await fetch(`/api/weather?${params}`, { signal });
    if (!response.ok) throw await readWeatherError(response);
    return response.json() as Promise<WeatherObservation>;
  },
  async listProviders(signal) {
    const response = await fetch('/api/weather/providers', { signal });
    if (!response.ok) throw await readWeatherError(response);
    return response.json() as Promise<WeatherProviderSummary[]>;
  },
  async geocode(query, signal) {
    const params = new URLSearchParams({
      provider: query.provider,
      q: query.query,
    });
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const response = await fetch(`/api/weather/geocode?${params}`, { signal });
    if (!response.ok) throw await readWeatherError(response);
    return response.json() as Promise<WeatherGeocodeResponse>;
  },
  async saveApiKey(provider, apiKey) {
    const response = await fetch(`/api/weather/providers/${encodeURIComponent(provider)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!response.ok) throw await readWeatherError(response);
    return response.json() as Promise<WeatherProviderSummary>;
  },
  async clearApiKey(provider) {
    const response = await fetch(`/api/weather/providers/${encodeURIComponent(provider)}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw await readWeatherError(response);
  },
};

export function WidgetHost({
  children,
  ...options
}: { children: ReactNode } & Partial<
  Pick<
    Host,
    | 'openMonitor'
    | 'groups'
    | 'pages'
    | 'wide'
    | 'incidentReading'
    | 'connectionReading'
    | 'connectionId'
  >
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
          readProbes,
          readProblems,
          readMaintenance,
          readAvailability,
          readLatency,
          readServiceTargets,

          readCertificates,
          readTargets,
          filterStatus,
        },
        weather: weatherHost,
        readSource: readWidgetSource,
      }}
    >
      {children}
    </WidgetHostProvider>
  );
}
