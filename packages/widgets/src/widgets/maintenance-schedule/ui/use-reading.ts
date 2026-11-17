import { useEffect, useState } from 'react';
import type { MonitoringMaintenance } from '../../../monitoring.js';
import type { MonitoringMaintenanceQuery, WidgetHost } from '../../../ui/host.js';

export type MaintenanceReading =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: MonitoringMaintenance; stale: boolean };

export function useMaintenanceReading(
  query: MonitoringMaintenanceQuery,
  read: NonNullable<WidgetHost['monitoring']>['readMaintenance'],
): MaintenanceReading {
  const key = JSON.stringify(query);
  const [state, setState] = useState<{
    key: string;
    data: MonitoringMaintenance | null;
    failed: boolean;
  }>({ key, data: null, failed: false });
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        if (!read) throw new Error('source unavailable');
        const data = await read(JSON.parse(key) as MonitoringMaintenanceQuery, request.signal);
        if (!active || request.signal.aborted) return;
        setState({ key, data, failed: false });
        // Refresh at the next visible transition, as well as regularly for edits and new windows.
        const now = Date.now();
        const next = Math.min(
          now + 60_000,
          ...data.items
            .flatMap((item) => [item.startsAt, item.endsAt])
            .filter((time) => time > now),
        );
        timer = setTimeout(refresh, Math.max(1, next - now));
      } catch {
        if (!active || request.signal.aborted) return;
        setState((previous) => ({
          key,
          data: previous.key === key ? previous.data : null,
          failed: true,
        }));
        timer = setTimeout(refresh, 60_000);
      }
    };
    void refresh();
    return () => {
      active = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [key, read]);
  if (state.key !== key) return { status: 'loading' };
  if (!state.data) return { status: state.failed ? 'error' : 'loading' };
  return {
    status: 'ready',
    data: state.data,
    stale: state.failed || Date.now() - state.data.generatedAt > 120_000,
  };
}
