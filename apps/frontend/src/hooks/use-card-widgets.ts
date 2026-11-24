import type { WidgetState } from '@homora/widgets';
import { useEffect, useState } from 'react';
import {
  widgetStats,
  type IntegrationWidget,
  type WidgetStat,
} from '@/features/connections/connection-model';

export type CardWidgetState = { widget: IntegrationWidget } & (
  | Extract<WidgetState<never>, { status: 'loading' | 'error' | 'invalid' }>
  | { status: 'ready'; stats: WidgetStat[]; data?: unknown; checkedAt?: string; stale?: boolean }
  /** The connection this widget read from no longer exists, so it has nothing to show. */
  | { status: 'unconfigured' }
);

const REFRESH_MS = 60_000;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error();
  return response.json();
}

/**
 * Widgets attached to cards, grouped by card. Each connection is queried once per cycle,
 * even if multiple widgets use it; failure of one does not affect others or the rest of the page.
 * While the widget list is loading (or fails), cards are displayed without widgets.
 */
export function useCardWidgets(reloadKey?: unknown): Record<number, CardWidgetState[]> {
  const [byService, setByService] = useState<Record<number, CardWidgetState[]>>({});

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;

    async function cycle() {
      let widgets: IntegrationWidget[];
      try {
        const list = await getJson('/api/widgets', signal);
        if (!Array.isArray(list)) return;
        widgets = (list as IntegrationWidget[]).filter((item) => item.serviceId !== null);
      } catch {
        return;
      }
      if (signal.aborted) return;
      const grouped = (states: (widget: IntegrationWidget) => CardWidgetState) => {
        const next: Record<number, CardWidgetState[]> = {};
        for (const widget of widgets)
          (next[widget.serviceId as number] ??= []).push(states(widget));
        return next;
      };
      setByService((current) =>
        grouped((widget) => {
          const known = Object.values(current)
            .flat()
            .find((entry) => entry.widget.id === widget.id);
          return known ? { ...known, widget } : { widget, status: 'loading' };
        }),
      );
      const results = new Map<number, { data: unknown; checkedAt?: string } | null>();
      await Promise.all(
        [...new Set(widgets.map((widget) => widget.integrationId))].map(async (id) => {
          try {
            const body = (await getJson(`/api/connections/${id}/data`, signal)) as {
              data?: unknown;
              checkedAt?: unknown;
            };
            results.set(id, {
              data: body.data,
              checkedAt: typeof body.checkedAt === 'string' ? body.checkedAt : undefined,
            });
          } catch {
            results.set(id, null);
          }
        }),
      );
      if (signal.aborted) return;
      setByService(
        grouped((widget): CardWidgetState => {
          const result = results.get(widget.integrationId);
          if (!result) return { widget, status: 'error' };
          let stats: ReturnType<typeof widgetStats>;
          try {
            stats = widgetStats(widget.type, result.data);
          } catch {
            return { widget, status: 'error' };
          }
          return stats
            ? { widget, status: 'ready', stats, checkedAt: result.checkedAt }
            : { widget, status: 'invalid' };
        }),
      );
    }

    const loop = async () => {
      await cycle();
      if (!signal.aborted) timer = window.setTimeout(() => void loop(), REFRESH_MS);
    };
    void loop();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [reloadKey]);

  return byService;
}
