import { useCallback, useEffect, useState } from 'react';
import type {
  ActivityEvent,
  ActivityKind,
  ActivityOutcome,
  ActivityPage,
} from '@/features/activity/activity-model';

export function useActivityFeed(kind: 'all' | ActivityKind, outcome: 'all' | ActivityOutcome) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (before?: number): Promise<ActivityPage | null> => {
      const params = new URLSearchParams();
      if (kind !== 'all') params.set('kind', kind);
      if (outcome !== 'all') params.set('outcome', outcome);
      if (before !== undefined) params.set('before', String(before));
      const response = await fetch(`/api/activity?${params}`).catch(() => null);
      return response?.ok ? ((await response.json()) as ActivityPage) : null;
    },
    [kind, outcome],
  );

  useEffect(() => {
    let active = true;
    void fetchPage().then((page) => {
      if (!active) return;
      setFailed(page === null);
      if (page) {
        setEvents(page.events);
        setNext(page.nextBefore);
      }
    });
    return () => {
      active = false;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (next === null) return;
    setLoadingMore(true);
    const page = await fetchPage(next);
    setLoadingMore(false);
    if (!page) {
      setFailed(true);
      return;
    }
    setEvents((current) => [...(current ?? []), ...page.events]);
    setNext(page.nextBefore);
  }, [fetchPage, next]);

  return { events, next, failed, loadingMore, loadMore };
}
