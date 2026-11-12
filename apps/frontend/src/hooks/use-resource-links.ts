import { useCallback, useEffect, useState } from 'react';
import type { ResourceLink } from '@homora/shared';
import { parseInventory, parseLinks, viewLink, type LinkView } from '@/lib/coolify';

export type CardCoolify = { link: ResourceLink; view: LinkView; checkedAt?: string };

const REFRESH_MS = 60_000;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error();
  return response.json();
}

/**
 * Coolify state of every linked card, once a minute. Each connection is read once per cycle and a
 * failure only affects its own cards ("unavailable"); it never reads as offline and never touches
 * a card.
 */
export function useResourceLinks() {
  const [byService, setByService] = useState<Record<number, CardCoolify>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: number | undefined;

    async function cycle() {
      let links: ResourceLink[];
      try {
        links = parseLinks(await getJson('/api/resource-links', signal));
      } catch {
        return;
      }
      if (signal.aborted) return;
      const inventories = new Map<
        number,
        { resources: Parameters<typeof viewLink>[1]; checkedAt?: string }
      >();
      await Promise.all(
        [...new Set(links.map((link) => link.integrationId))].map(async (id) => {
          try {
            const parsed = parseInventory(
              await getJson(`/api/connections/${id}/resources`, signal),
            );
            inventories.set(id, parsed ?? { resources: null });
          } catch {
            inventories.set(id, { resources: null });
          }
        }),
      );
      if (signal.aborted) return;
      const next: Record<number, CardCoolify> = {};
      for (const link of links) {
        const inventory = inventories.get(link.integrationId);
        next[link.serviceId] = {
          link,
          view: viewLink(link, inventory?.resources ?? null),
          checkedAt: inventory?.checkedAt,
        };
      }
      setByService(next);
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
  }, [tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { byService, reload };
}
