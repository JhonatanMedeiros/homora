import { useEffect, useState } from 'react';
import { useDiscoveryReview } from '@/hooks/use-discovery-review';
import { apiError, t } from '@/i18n';
import {
  localDiscoverySuggestions,
  type Found,
  type LocalDiscoveryState,
} from '@/features/discovery/local-discovery-model';

/** Local Docker scan state, selection, and reviewable card import actions. */
export function useLocalDiscovery(onImported: () => void | Promise<void>) {
  const [state, setState] = useState<LocalDiscoveryState>({ status: 'loading' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function scan() {
      try {
        const response = await fetch('/api/discovery', { signal: controller.signal });
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setState({ status: 'error', message: apiError(body, t('discovery.failed')) });
        } else if (
          !body ||
          typeof body !== 'object' ||
          (body as { enabled?: unknown }).enabled !== true
        ) {
          setState({ status: 'disabled' });
        } else {
          setState({ status: 'ready', found: body as Found });
          setSelected(new Set());
        }
      } catch {
        if (!controller.signal.aborted)
          setState({ status: 'error', message: t('discovery.failed') });
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }
    void scan();
    return () => controller.abort();
  }, [reload]);

  function rescan() {
    setBusy(true);
    setReload((value) => value + 1);
  }

  const review = useDiscoveryReview({
    endpoint: '/api/discovery/import',
    extra: {},
    onDone: async () => {
      await onImported();
      setReload((value) => value + 1);
    },
  });

  const items = localDiscoverySuggestions(state);
  function startReview() {
    review.open(
      items.flatMap((item) =>
        item.id && selected.has(item.id)
          ? [{ ...item, id: item.id, container: item.container }]
          : [],
      ),
    );
  }
  const newCount = items.filter((item) => item.isNew).length;

  return {
    state,
    selected,
    setSelected,
    busy,
    rescan,
    review,
    startReview,
    items,
    newCount,
  };
}
