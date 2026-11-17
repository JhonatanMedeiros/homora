import { useEffect, useState } from 'react';
import type { MonitoringAvailability } from '../../../monitoring.js';
import type {
  MonitoringAvailabilityQuery,
  MonitoringTargetOption,
  WidgetHost,
} from '../../../ui/host.js';

export type AvailabilityReading =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: MonitoringAvailability; stale: boolean; now: number };

export type TargetOptionsState = {
  targets: MonitoringTargetOption[];
  loading: boolean;
  error: boolean;
};

export function useAvailabilityReading(
  query: MonitoringAvailabilityQuery,
  read: NonNullable<WidgetHost['monitoring']>['readAvailability'],
): AvailabilityReading {
  const normalizedTarget = query.target.trim();
  const key = JSON.stringify({ target: normalizedTarget, range: query.range });
  const [state, setState] = useState<{
    key: string;
    data: MonitoringAvailability | null;
    failed: boolean;
    now: number;
  }>({ key, data: null, failed: false, now: Date.now() });

  useEffect(() => {
    if (!normalizedTarget) return;
    const current = JSON.parse(key) as MonitoringAvailabilityQuery;
    let active = true;
    let controller: AbortController | undefined;
    const refresh = async () => {
      setState((previous) =>
        previous.key === key && previous.data ? { ...previous, now: Date.now() } : previous,
      );
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        if (!read) throw new Error('source unavailable');
        const data = await read(current, request.signal);
        if (active && !request.signal.aborted) {
          setState({ key, data, failed: false, now: Date.now() });
        }
      } catch {
        if (active && !request.signal.aborted) {
          setState((previous) => ({
            key,
            data: previous.key === key ? previous.data : null,
            failed: true,
            now: Date.now(),
          }));
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [key, normalizedTarget, read]);

  if (!normalizedTarget) return { status: 'unconfigured' };
  if (state.key !== key) return { status: 'loading' };
  if (!state.data) return { status: state.failed ? 'error' : 'loading' };
  return {
    status: 'ready',
    data: state.data,
    now: state.now,
    stale: state.failed || state.now - state.data.generatedAt > 120_000,
  };
}

export function useTargetOptions(
  read: NonNullable<WidgetHost['monitoring']>['readTargets'],
): TargetOptionsState {
  const [state, setState] = useState<TargetOptionsState>({
    targets: [],
    loading: true,
    error: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        if (!read) throw new Error('targets unavailable');
        const targets = await read(controller.signal);
        if (!controller.signal.aborted) {
          setState({ targets, loading: false, error: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ targets: [], loading: false, error: true });
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [read]);

  return state;
}
