import { useCallback, useEffect, useRef, useState } from 'react';
import { widgetStats, type Connection } from '@/features/connections/connection-model';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import { t } from '@/i18n';

export type PageWidget = {
  id: number;
  pageId: number;
  type: string;
  name: string;
  config: unknown;
  connectionId: number | null;
  position: number;
  version: number;
};

export function usePageWidgetData(pageId: number) {
  const [widgets, setWidgets] = useState<PageWidget[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [readings, setReadings] = useState<Record<number, CardWidgetState>>({});
  /** Last good reading of each widget, so a failing connection shows old data marked as such. */
  const lastGood = useRef<Record<number, CardWidgetState & { status: 'ready' }>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const response = await fetch('/api/page-widgets');
    if (!response.ok) throw new Error();
    setWidgets((await response.json()) as PageWidget[]);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      // Initial load synchronizes this view with the server.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reload(),
      fetch('/api/connections').then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([, rows]) => {
        if (active) setConnections(rows as Connection[]);
      })
      .catch(() => {
        if (active) setError(t('pageWidgets.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    const cycle = async () => {
      const connected = widgets.filter(
        (widget) => widget.connectionId !== null && widget.version === 1,
      );
      const results = new Map<number, unknown>();
      await Promise.all(
        [...new Set(connected.map((widget) => widget.connectionId!))].map(async (id) => {
          try {
            const response = await fetch(`/api/connections/${id}/data`, {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error();
            results.set(id, ((await response.json()) as { data: unknown }).data);
          } catch {
            results.set(id, null);
          }
        }),
      );
      if (controller.signal.aborted) return;
      const next: Record<number, CardWidgetState> = {};
      for (const item of connected) {
        const widget = {
          id: item.id,
          integrationId: item.connectionId!,
          type: item.type,
          name:
            item.name ||
            connections.find((connection) => connection.id === item.connectionId)?.name ||
            item.type,
          serviceId: null,
        };
        const data = results.get(item.connectionId!);
        let stats: ReturnType<typeof widgetStats> = null;
        try {
          if (data) stats = widgetStats(item.type, data);
        } catch {
          /* Isolate a broken presentation. */
        }
        const good = lastGood.current[item.id];
        if (data && stats) {
          const fresh = {
            widget,
            status: 'ready' as const,
            stats,
            checkedAt: new Date().toISOString(),
          };
          lastGood.current[item.id] = fresh;
          next[item.id] = fresh;
        } else if (!data && good) {
          next[item.id] = { ...good, widget, stale: true };
        } else {
          next[item.id] = data ? { widget, status: 'invalid' } : { widget, status: 'error' };
        }
      }
      setReadings(next);
      timer = window.setTimeout(() => void cycle(), 60_000);
    };
    void cycle();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [widgets, connections]);
  const current = widgets.filter((item) => item.pageId === pageId);
  async function change(url: string, method: string, body?: unknown) {
    if (busy) return false;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error();
      await reload();
      setError('');
      return true;
    } catch {
      setError(t('pageWidgets.failed'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const reorder = (id: number, to: number) => {
    const ids = current.map((entry) => entry.id);
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    // Show the new order at once; the request below reloads the stored one.
    setWidgets((rows) => {
      const slots = rows.flatMap((row, i) => (row.pageId === pageId ? [i] : []));
      const next = [...rows];
      ids.forEach((widgetId, i) => {
        next[slots[i]!] = rows.find((row) => row.id === widgetId)!;
      });
      return next;
    });
    void change('/api/page-widgets/order', 'PUT', { pageId, ids }).then((ok) => {
      if (!ok) void reload();
    });
  };
  return { widgets, connections, readings, error, busy, loading, change, reorder };
}
