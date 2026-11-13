import { useEffect, useState } from 'react';
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
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [message, setMessage] = useState('');
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
    setMessage('');
    setReload((value) => value + 1);
  }

  async function add() {
    if (state.status !== 'ready' || selected.size === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/discovery/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [...selected],
          keepPrivate: allowPrivate,
          expectedVersion: state.found.version,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(apiError(body, t('discovery.failed')));
        return;
      }
      const created = (body as { created?: number }).created ?? 0;
      await onImported();
      setMessage(t('discovery.added', { count: created }));
      setReload((value) => value + 1);
    } catch {
      setMessage(t('discovery.failed'));
    } finally {
      setBusy(false);
    }
  }

  const items = localDiscoverySuggestions(state);
  const newCount = items.filter((item) => item.isNew).length;

  return {
    state,
    selected,
    setSelected,
    allowPrivate,
    setAllowPrivate,
    message,
    busy,
    rescan,
    add,
    items,
    newCount,
  };
}
