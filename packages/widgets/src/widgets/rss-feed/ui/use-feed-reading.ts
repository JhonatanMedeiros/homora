import { useEffect, useState } from 'react';
import {
  FeedSourceError,
  type FeedData,
  type FeedQuery,
  type WidgetHost,
} from '../../../ui/host.js';
import { parseFeedUrl } from '../definition.js';

export type FeedReading =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'policy-blocked' }
  | { status: 'error' }
  | { status: 'ready'; data: FeedData; stale: boolean };

const REFRESH_INTERVAL_MS = 5 * 60_000;

export function useFeedReading(query: FeedQuery, readFeed: WidgetHost['readFeed']): FeedReading {
  const validUrl = parseFeedUrl(query.feedUrl);
  const key = validUrl
    ? JSON.stringify({
        feedUrl: validUrl,
        limit: query.limit,
        allowPrivateNetwork: query.allowPrivateNetwork,
      })
    : '';

  const [state, setState] = useState<{
    key: string;
    data: FeedData | null;
    error: 'none' | 'policy-blocked' | 'fetch-failed';
  }>({ key, data: null, error: 'none' });

  useEffect(() => {
    if (!key) return;
    const current = JSON.parse(key) as FeedQuery;
    let active = true;
    let controller: AbortController | undefined;

    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        if (!readFeed) throw new FeedSourceError('fetch-failed', 'Feed source unavailable');
        const data = await readFeed(current, request.signal);
        if (active && !request.signal.aborted) {
          setState({ key, data, error: 'none' });
        }
      } catch (err) {
        if (!active || request.signal.aborted) return;
        const isPolicy =
          err instanceof FeedSourceError
            ? err.code === 'policy-blocked'
            : typeof err === 'object' &&
              err !== null &&
              'code' in err &&
              (err as { code?: unknown }).code === 'policy-blocked';
        if (isPolicy) {
          setState({ key, data: null, error: 'policy-blocked' });
          return;
        }
        setState((previous) => ({
          key,
          data: previous.key === key ? previous.data : null,
          error: 'fetch-failed',
        }));
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [key, readFeed]);

  if (!key) return { status: 'unconfigured' };
  if (state.key !== key) return { status: 'loading' };
  if (state.error === 'policy-blocked') return { status: 'policy-blocked' };
  if (!state.data) return { status: state.error === 'fetch-failed' ? 'error' : 'loading' };
  return {
    status: 'ready',
    data: state.data,
    stale: state.data.stale || state.error === 'fetch-failed',
  };
}
