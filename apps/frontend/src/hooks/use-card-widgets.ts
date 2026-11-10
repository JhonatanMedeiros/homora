import { useEffect, useState } from 'react';
import {
  widgetStats,
  type IntegrationWidget,
  type WidgetStat,
} from '@/features/connections/connection-model';

export type CardWidgetState =
  | { widget: IntegrationWidget; status: 'loading' }
  | { widget: IntegrationWidget; status: 'error' }
  | { widget: IntegrationWidget; status: 'invalid' }
  | { widget: IntegrationWidget; status: 'ready'; stats: WidgetStat[]; checkedAt?: string };

const REFRESH_MS = 60_000;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error();
  return response.json();
}

/**
 * Widgets ligados a cards, agrupados por card. Cada conexão é consultada uma vez por ciclo,
 * mesmo que vários widgets a usem; a falha de uma não afeta as demais nem o resto da página.
 * Enquanto a lista de widgets não carrega (ou falha), os cards aparecem sem widgets.
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
          const stats = widgetStats(widget.type, result.data);
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
