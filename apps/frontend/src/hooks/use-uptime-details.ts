import { useEffect, useState } from 'react';
import type { UptimeRange, UptimeSummary } from '@homora/shared';

export type PercentileState = number | null | 'loading' | 'error';

/** Loads the per-service percentile for the expanded uptime details. */
export function useUptimeDetails(serviceId: number, range: UptimeRange, checks: number) {
  const key = `${serviceId}:${range}:${checks}`;
  const [result, setResult] = useState<{ key: string; p95: number | null | 'error' }>();
  const p95: PercentileState = result?.key === key ? result.p95 : 'loading';

  useEffect(() => {
    let active = true;
    fetch(`/api/services/${serviceId}/uptime?range=${range}`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<UptimeSummary>;
      })
      .then((data) => active && setResult({ key, p95: data.p95LatencyMs ?? null }))
      .catch(() => active && setResult({ key, p95: 'error' }));
    return () => {
      active = false;
    };
  }, [serviceId, range, key]);

  return p95;
}
