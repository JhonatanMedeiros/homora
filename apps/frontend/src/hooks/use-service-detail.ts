import { useEffect, useState } from 'react';
import type {
  Incident,
  LatencySeries,
  ServiceInsights,
  UptimeRange,
  UptimeSummary,
} from '@homora/shared';

type Loaded<T> = { key: string; value: T } | { key: string; failed: true };

/** One JSON endpoint of the detail page, reloaded every minute; the key keeps stale data of another request out. */
function useJson<T>(url: string, accept: (value: unknown) => value is T) {
  const [state, setState] = useState<Loaded<T>>();
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(url)
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<unknown>;
        })
        .then((value) => {
          if (!accept(value)) throw new Error();
          if (active) setState({ key: url, value });
        })
        .catch(() => {
          if (active)
            setState((previous) => (previous?.key === url ? previous : { key: url, failed: true }));
        });
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
    // `accept` is a module-level guard, stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const current = state?.key === url ? state : undefined;
  return {
    data: current && 'value' in current ? current.value : undefined,
    failed: Boolean(current && 'failed' in current),
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isSummary = (value: unknown): value is UptimeSummary =>
  isObject(value) && Array.isArray(value.buckets);
const isSeries = (value: unknown): value is LatencySeries =>
  isObject(value) && Array.isArray(value.points) && typeof value.bucketMs === 'number';
const isInsights = (value: unknown): value is ServiceInsights =>
  isObject(value) && Array.isArray(value.heat) && Array.isArray(value.recent);
const isIncidents = (
  value: unknown,
): value is { incidents: Incident[]; nextBefore: number | null } =>
  isObject(value) && Array.isArray(value.incidents);

/** Everything the detail page shows for one service. */
export function useServiceDetail(id: number, latencyRange: UptimeRange) {
  const base = `/api/services/${id}`;
  const day = useJson(`${base}/uptime?range=24h`, isSummary);
  const week = useJson(`${base}/uptime?range=7d`, isSummary);
  const month = useJson(`${base}/uptime?range=30d`, isSummary);
  const latency = useJson(`${base}/latency?range=${latencyRange}`, isSeries);
  const insights = useJson(`${base}/insights`, isInsights);
  const incidents = useJson(`${base}/incidents?limit=100`, isIncidents);
  return {
    uptime: { '24h': day.data, '7d': week.data, '30d': month.data },
    latency: latency.data,
    insights: insights.data,
    incidents: incidents.data?.incidents,
    failed: day.failed && insights.failed && incidents.failed,
    insightsFailed: insights.failed,
    incidentsFailed: incidents.failed,
    latencyFailed: latency.failed,
  };
}
