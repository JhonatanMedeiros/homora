import { useEffect, useState } from 'react';

/** Dispatched on `window` after the proposal list changes, so the badge refreshes at once. */
export const PROPOSALS_CHANGED = 'homora:proposals-changed';

export const PROPOSALS_POLL_MS = 15_000;

/** How many agent proposals wait for review. Refreshes when `refreshKey` changes (e.g. the section). */
export function usePendingProposals(refreshKey: string, enabled: boolean) {
  const [count, setCount] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    window.addEventListener(PROPOSALS_CHANGED, bump);
    return () => window.removeEventListener(PROPOSALS_CHANGED, bump);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const bump = () => {
      if (document.visibilityState === 'visible') setVersion((value) => value + 1);
    };
    const timer = window.setInterval(bump, PROPOSALS_POLL_MS);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', bump);
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch('/api/proposals', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const now = Date.now();
        setCount(
          data.filter(
            (item) =>
              (item?.state === 'pending' || item?.state === 'stale') &&
              typeof item.expiresAt === 'number' &&
              item.expiresAt > now,
          ).length,
        );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [refreshKey, enabled, version]);
  return count;
}
