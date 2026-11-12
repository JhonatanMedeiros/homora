import { useEffect, useState } from 'react';

/** How many agent proposals wait for review. Refreshes when `refreshKey` changes (e.g. the section). */
export function usePendingProposals(refreshKey: string, enabled: boolean) {
  const [count, setCount] = useState(0);
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
  }, [refreshKey, enabled]);
  return count;
}
