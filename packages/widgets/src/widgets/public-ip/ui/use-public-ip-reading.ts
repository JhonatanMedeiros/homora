import { useCallback, useEffect, useRef, useState } from 'react';
import { WidgetSourceError, type WidgetHost } from '../../../ui/host.js';
import type { PublicIpConfig } from '../definition.js';
import type { PublicIpSourceResult } from '../source.js';

export type PublicIpReading =
  | { status: 'opt-in-pending' }
  | { status: 'loading' }
  | { status: 'policy-blocked'; refresh: () => void }
  | { status: 'error'; refresh: () => void }
  | {
      status: 'ready';
      data: PublicIpSourceResult;
      stale: boolean;
      refreshing: boolean;
      refresh: () => void;
    };

const REFRESH_INTERVAL_MS = 5 * 60_000;

export function usePublicIpReading(
  config: PublicIpConfig,
  readSource: WidgetHost['readSource'],
): PublicIpReading {
  const key = config.optIn ? `${config.provider}\0${config.addressFamily}` : '';

  const [state, setState] = useState<{
    key: string;
    data: PublicIpSourceResult | null;
    error: 'none' | 'policy-blocked' | 'fetch-failed';
    refreshing: boolean;
  }>({ key, data: null, error: 'none', refreshing: false });

  const abortRef = useRef<AbortController | undefined>(undefined);
  const activeRef = useRef(true);

  const performFetch = useCallback(
    async (targetKey: string, provider: string, addressFamily: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((prev) =>
        prev.key === targetKey
          ? { ...prev, refreshing: true }
          : { key: targetKey, data: null, error: 'none', refreshing: true },
      );

      try {
        if (!readSource) {
          throw new WidgetSourceError('fetch-failed', 'Public IP source unavailable');
        }
        const data = await readSource<PublicIpSourceResult>(
          'public-ip',
          { provider, addressFamily },
          controller.signal,
        );
        if (activeRef.current && !controller.signal.aborted) {
          setState({ key: targetKey, data, error: 'none', refreshing: false });
        }
      } catch (err) {
        if (!activeRef.current || controller.signal.aborted) return;
        const isPolicy =
          err instanceof WidgetSourceError
            ? err.code === 'policy-blocked'
            : typeof err === 'object' &&
              err !== null &&
              'code' in err &&
              (err as { code?: unknown }).code === 'policy-blocked';
        if (isPolicy) {
          setState({ key: targetKey, data: null, error: 'policy-blocked', refreshing: false });
          return;
        }
        setState((prev) => ({
          key: targetKey,
          data: prev.key === targetKey ? prev.data : null,
          error: 'fetch-failed',
          refreshing: false,
        }));
      }
    },
    [readSource],
  );

  useEffect(() => {
    activeRef.current = true;
    if (!key) {
      abortRef.current?.abort();
      return () => {
        activeRef.current = false;
      };
    }

    const [provider, addressFamily] = key.split('\0');
    void performFetch(key, provider, addressFamily);

    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void performFetch(key, provider, addressFamily);
      }
    }, REFRESH_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      abortRef.current?.abort();
      window.clearInterval(timer);
    };
  }, [key, performFetch]);

  const refresh = useCallback(() => {
    if (!key) return;
    const [provider, addressFamily] = key.split('\0');
    void performFetch(key, provider, addressFamily);
  }, [key, performFetch]);

  if (!key) return { status: 'opt-in-pending' };
  if (state.key !== key) return { status: 'loading' };
  if (state.error === 'policy-blocked') return { status: 'policy-blocked', refresh };
  if (!state.data) {
    return state.error === 'fetch-failed' ? { status: 'error', refresh } : { status: 'loading' };
  }
  return {
    status: 'ready',
    data: state.data,
    stale: state.data.stale || state.error === 'fetch-failed',
    refreshing: state.refreshing,
    refresh,
  };
}
