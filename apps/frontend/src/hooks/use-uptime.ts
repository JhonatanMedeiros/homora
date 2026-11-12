import { useEffect, useState } from 'react';
import type { UptimeRange, UptimeSummary } from '@homora/shared';

/** Uptime of every service for one period, in a single request (cards never fetch one by one). */
export function useUptime(range: UptimeRange) {
  const [loaded, setLoaded] = useState<{
    range: UptimeRange;
    data: Record<number, UptimeSummary>;
  }>();
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch(`/api/services/uptime?range=${range}`)
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<Record<number, UptimeSummary>>;
        })
        .then((data) => {
          if (!active) return;
          // Keep only well-formed summaries; anything else just means "no history to show".
          const valid: Record<number, UptimeSummary> = {};
          for (const [id, entry] of Object.entries(data))
            if (entry && Array.isArray(entry.buckets) && entry.range === range)
              valid[Number(id)] = entry;
          setLoaded({ range, data: valid });
        })
        // History is auxiliary: without it the cards simply show no percentage.
        .catch(() => {});
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [range]);
  // Data of another period is never shown under the selected one.
  return loaded?.range === range ? loaded.data : {};
}
