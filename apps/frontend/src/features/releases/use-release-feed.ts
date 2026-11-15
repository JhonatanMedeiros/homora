import { useCallback, useEffect, useState } from 'react';
import { fetchReleases, type Release } from './release-feed';

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
export function useReleaseFeed() {
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'error';
    releases: Release[];
    demo: boolean;
  }>({ status: 'loading', releases: [], demo: false });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }));
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    async function check() {
      request = new AbortController();
      const current = request;
      const timer = setTimeout(() => current.abort(), 8000);
      try {
        const result = await fetchReleases(current.signal);
        if (!controller.signal.aborted) setState({ status: 'ready', ...result });
      } catch {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, status: 'error' }));
      } finally {
        clearTimeout(timer);
      }
      if (!controller.signal.aborted) timeout = setTimeout(() => void check(), CHECK_INTERVAL);
    }
    void check();
    return () => {
      controller.abort();
      request?.abort();
      clearTimeout(timeout);
    };
  }, [attempt]);
  return { ...state, retry };
}
