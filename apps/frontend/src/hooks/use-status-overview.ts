import { useEffect, useState } from 'react';
import type { StatusOverview } from '@homora/shared';

/**
 * Banner numbers (incidents, recovery time, availability target), the open incident of each service
 * and the alert settings. Auxiliary like the uptime: when it cannot be loaded the dashboard simply
 * shows less. Refreshed every minute and whenever `version` changes (after a service is saved).
 */
export function useStatusOverview(version = 0) {
  const [overview, setOverview] = useState<StatusOverview>();
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/status-overview')
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<StatusOverview>;
        })
        .then((data) => {
          if (active && data && typeof data.incidents7d === 'number') setOverview(data);
        })
        .catch(() => {});
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [version]);
  return overview;
}
