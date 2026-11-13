import { useCallback, useEffect, useState } from 'react';
import type { Maintenance, MaintenanceOverview } from '@homora/shared';

/**
 * Maintenance windows that are open now or still ahead. Auxiliary like the uptime: when they
 * cannot be loaded the dashboard simply shows no maintenance. Reloaded every minute (windows open
 * and close on their own) and on demand after one is scheduled or cancelled.
 */
export function useMaintenance() {
  const [windows, setWindows] = useState<Maintenance[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/maintenance')
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<MaintenanceOverview>;
        })
        .then((data) => {
          if (active && Array.isArray(data?.windows)) setWindows(data.windows);
        })
        .catch(() => {});
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { windows, reload };
}

/** The window each service is in at `now`. */
export function activeWindows(windows: Maintenance[], now: number): Record<number, Maintenance> {
  const result: Record<number, Maintenance> = {};
  for (const item of windows)
    if (item.startsAt <= now && item.endsAt > now) result[item.serviceId] = item;
  return result;
}
