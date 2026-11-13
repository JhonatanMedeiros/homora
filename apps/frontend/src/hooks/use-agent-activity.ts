import { useEffect, useState } from 'react';
import type { ActivityEvent, ActivityPage } from '@/features/activity/activity-model';

/** The latest audited proposal events, to show each agent's recent activity. `null` while loading. */
export function useAgentActivity(refreshKey: unknown) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/activity?kind=proposal&limit=100')
      .then((response) => (response.ok ? (response.json() as Promise<ActivityPage>) : null))
      .catch(() => null)
      .then((page) => !cancelled && setEvents(page?.events ?? []));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return events;
}
