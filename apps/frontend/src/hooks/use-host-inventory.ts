import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  HostConnection,
  HostGuest,
  HostInventories,
  HostInventory,
  HostNode,
} from '@/lib/hosts';

type Connection = { id: number; name: string; type: string };

/**
 * Proxmox connections and their guest inventory. The inventory (names and ids) is fetched from
 * the authenticated API only when `enabled` or when `needed` connections are linked, and is kept
 * in memory; the backend caches it for 30 s, so repeated calls do not hit Proxmox.
 */
export function useHostInventory(enabled: boolean, needed: number[]) {
  const [connections, setConnections] = useState<HostConnection[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [inventories, setInventories] = useState<HostInventories>({});
  const requested = useRef(new Set<number>());

  const wantsData = enabled || needed.length > 0;
  useEffect(() => {
    if (!wantsData) return;
    let active = true;
    fetch('/api/connections')
      .then((response) => (response.ok ? (response.json() as Promise<Connection[]>) : []))
      .then((rows) => {
        if (!active) return;
        setConnections(
          rows.filter((row) => row.type === 'proxmox').map(({ id, name }) => ({ id, name })),
        );
        setConnectionsLoaded(true);
      })
      .catch(() => {
        if (active) setConnectionsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [wantsData]);

  const load = useCallback(async (id: number, refresh = false) => {
    requested.current.add(id);
    setInventories((current) => ({ ...current, [id]: { status: 'loading' } }));
    let next: HostInventory = { status: 'error' };
    try {
      const response = await fetch(
        `/api/connections/${id}/guests${refresh ? '?refresh=true' : ''}`,
      );
      if (response.ok) {
        const body = (await response.json()) as {
          data?: { nodes?: unknown; guests?: unknown };
        };
        if (Array.isArray(body.data?.nodes) && Array.isArray(body.data?.guests))
          next = {
            status: 'ready',
            nodes: body.data.nodes as HostNode[],
            guests: body.data.guests as HostGuest[],
          };
      }
    } catch {
      /* keep the error state */
    }
    setInventories((current) => ({ ...current, [id]: next }));
  }, []);

  const wanted = enabled ? connections.map((connection) => connection.id) : needed;
  const key = wanted.join(',');
  useEffect(() => {
    for (const id of key ? key.split(',').map(Number) : [])
      if (!requested.current.has(id)) void load(id);
  }, [key, load, connectionsLoaded]);

  return { connections, connectionsLoaded, inventories, reload: load };
}
