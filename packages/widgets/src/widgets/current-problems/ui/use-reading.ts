import { useEffect, useState } from 'react';
import type { MonitoringProblems } from '../../../monitoring.js';
import type {
  MonitoringProblemsQuery,
  MonitoringProblemsReading,
  WidgetHost,
  WidgetScopeOptions,
} from '../../../ui/host.js';

export function useProblemsReading(
  query: MonitoringProblemsQuery,
  read: NonNullable<WidgetHost['monitoring']>['readProblems'],
): MonitoringProblemsReading {
  const key = JSON.stringify(query);
  const [state, setState] = useState<{
    key: string;
    data: MonitoringProblems | null;
    failed: boolean;
    now: number;
  }>({ key, data: null, failed: false, now: Date.now() });
  useEffect(() => {
    const current = JSON.parse(key) as MonitoringProblemsQuery;
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
        if (active && !request.signal.aborted)
          setState({ key, data, failed: false, now: Date.now() });
      } catch {
        if (active && !request.signal.aborted)
          setState((previous) => ({
            key,
            data: previous.key === key ? previous.data : null,
            failed: true,
            now: Date.now(),
          }));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [key, read]);
  if (state.key !== key) return { status: 'loading' };
  if (!state.data) return { status: state.failed ? 'error' : 'loading' };
  return {
    status: 'ready',
    data: state.data,
    now: state.now,
    stale: state.failed || state.now - state.data.generatedAt > 120_000,
  };
}

export function useScopeOptions(
  read: NonNullable<WidgetHost['monitoring']>['readScopes'] | undefined,
): WidgetScopeOptions {
  const [state, setState] = useState<WidgetScopeOptions>({
    pages: [],
    groups: [],
    error: false,
    loading: true,
  });
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      try {
        if (!read) throw new Error('scope unavailable');
        const result = await read(controller.signal);
        if (!controller.signal.aborted)
          setState({
            pages: result.pages.map((item) => item.name),
            groups: result.groups.map((item) => item.name),
            error: false,
            loading: false,
          });
      } catch {
        if (!controller.signal.aborted)
          setState({ pages: [], groups: [], error: true, loading: false });
      }
    };
    void refresh();
    return () => controller.abort();
  }, [read]);
  return state;
}
