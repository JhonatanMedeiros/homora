import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoolifyResource, ResourceLink } from '@homora/shared';
import { apiError, t } from '@/i18n';
import { parseInventory, parseLinks } from '@/lib/coolify';
import type { CardRef, GroupRef } from '@/features/connections/connection-model';

export type { CardRef, GroupRef } from '@/features/connections/connection-model';
export type InventoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; resources: CoolifyResource[]; checkedAt?: string };

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiError(body, t('coolify.loadError')));
  return body;
}

/**
 * Inventory of one Coolify connection plus the cards, groups and links needed to act on it.
 * The inventory is read from the authenticated API (the backend caches it for 30 s); a failed read
 * keeps the error visible and never turns into "offline".
 */
export function useCoolifyResources(connectionId: number | null) {
  const [inventory, setInventory] = useState<InventoryState>({ status: 'loading' });
  const [links, setLinks] = useState<ResourceLink[]>([]);
  const [cards, setCards] = useState<CardRef[]>([]);
  const [groups, setGroups] = useState<GroupRef[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const loadSide = useCallback(async (signal?: AbortSignal) => {
    const [linkBody, cardBody, groupBody] = await Promise.all([
      getJson('/api/resource-links', signal).catch(() => []),
      getJson('/api/services', signal).catch(() => []),
      getJson('/api/groups', signal).catch(() => []),
    ]);
    if (signal?.aborted) return;
    setLinks(parseLinks(linkBody));
    setCards(
      Array.isArray(cardBody)
        ? (cardBody as CardRef[])
            .filter((card) => typeof card?.id === 'number' && typeof card.name === 'string')
            .map(({ id, name, url }) => ({ id, name, url: typeof url === 'string' ? url : '' }))
        : [],
    );
    setGroups(
      Array.isArray(groupBody)
        ? (groupBody as GroupRef[])
            .filter((group) => typeof group?.name === 'string')
            .map(({ id, name }) => ({ id, name }))
        : [],
    );
  }, []);

  const loadInventory = useCallback(
    async (refresh: boolean, signal?: AbortSignal) => {
      if (connectionId === null) return;
      const mine = ++generation.current;
      try {
        const body = await getJson(
          `/api/connections/${connectionId}/resources${refresh ? '?refresh=true' : ''}`,
          signal,
        );
        const parsed = parseInventory(body);
        if (signal?.aborted || mine !== generation.current) return;
        setInventory(
          parsed
            ? { status: 'ready', ...parsed }
            : { status: 'error', message: t('coolify.invalidData') },
        );
      } catch (error) {
        if (signal?.aborted || mine !== generation.current) return;
        setInventory({
          status: 'error',
          message: error instanceof Error ? error.message : t('coolify.loadError'),
        });
      }
    },
    [connectionId],
  );

  useEffect(() => {
    if (connectionId === null) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data from the server
    void loadInventory(false, controller.signal);
    void loadSide(controller.signal);
    return () => controller.abort();
  }, [connectionId, loadInventory, loadSide]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadInventory(true), loadSide()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadInventory, loadSide]);

  return { inventory, links, cards, groups, refreshing, refresh, reloadSide: loadSide };
}
