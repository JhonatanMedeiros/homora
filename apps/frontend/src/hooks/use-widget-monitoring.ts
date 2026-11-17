import { useEffect, useState } from 'react';
import type { MonitoringIncidents } from '@homora/widgets';
import type { MonitoringQuery, MonitoringReading } from '@homora/widgets/ui';
import { readIncidents } from '@/components/widget-host';

/** Each mounted widget owns its request and last good result. */
export function useWidgetMonitoring(query: MonitoringQuery | null): MonitoringReading {
  const key = JSON.stringify(query);
  const [state, setState] = useState<{ key: string; reading: MonitoringReading }>({
    key,
    reading: { status: 'loading' },
  });
  useEffect(() => {
    if (key === 'null') return;
    const options = JSON.parse(key) as MonitoringQuery;
    const controller = new AbortController();
    let timer: number;
    let last: MonitoringIncidents | null = null;
    const load = async () => {
      try {
        const data = await readIncidents(
          options,
          AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        );
        if (controller.signal.aborted) return;
        last = data;
        setState({
          key,
          reading: { status: 'ready', data, stale: Date.now() - data.generatedAt > 120_000 },
        });
      } catch {
        if (controller.signal.aborted) return;
        setState({
          key,
          reading: last ? { status: 'ready', data: last, stale: true } : { status: 'error' },
        });
      }
      timer = window.setTimeout(() => void load(), 60_000);
    };
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key]);
  return state.key === key ? state.reading : { status: 'loading' };
}
