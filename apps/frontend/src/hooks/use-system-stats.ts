import { useEffect, useState } from 'react';
import {
  widgetStats,
  type IntegrationWidget,
  type WidgetStat,
} from '@/features/connections/connection-model';

export type SystemStats =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'error' }
  | { status: 'ready'; stats: WidgetStat[] };

const REFRESH_MS = 60_000;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error();
  return response.json();
}

/**
 * System telemetry for top bar, polled from Proxmox widget (no host agent).
 * Only CPU, memory, and disk are surfaced; VMs and containers remain on cards.
 */
export function useSystemStats(enabled: boolean): SystemStats {
  const [state, setState] = useState<SystemStats>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;

    async function cycle() {
      try {
        const list = await getJson('/api/widgets', signal);
        const widget = Array.isArray(list)
          ? (list as IntegrationWidget[]).find((item) => item.type === 'proxmox')
          : undefined;
        if (signal.aborted) return;
        if (!widget) return setState({ status: 'none' });
        const body = (await getJson(`/api/connections/${widget.integrationId}/data`, signal)) as {
          data?: unknown;
        };
        const stats = widgetStats('proxmox', body.data)?.filter((stat) => stat.id !== undefined);
        if (signal.aborted) return;
        setState(stats && stats.length > 0 ? { status: 'ready', stats } : { status: 'error' });
      } catch {
        if (!signal.aborted) setState({ status: 'error' });
      }
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
  }, [enabled]);

  return state;
}
