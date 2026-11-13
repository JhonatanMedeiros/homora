import { useCallback, useEffect, useRef, useState } from 'react';
import { hasInventoryDomain } from '@homora/integrations';
import type {
  HostConnection,
  HostGuest,
  HostInventories,
  HostInventory,
  HostNode,
} from '@/lib/hosts';

type Connection = { id: number; name: string; type: string };

/**
 * host inventory connections and their guest inventory. The inventory (names and ids) is fetched from
 * the authenticated API only when `enabled` or when `needed` connections are linked, and is kept
 * in memory; the backend caches it for 30 s, so repeated calls do not query the external system.
 */
export function useHostInventory(enabled: boolean, needed: number[]) {
  const [connections, setConnections] = useState<HostConnection[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [inventories, setInventories] = useState<HostInventories>({});
  const requested = useRef(new Set<number>());

  // The connection list is local (no external call), so it is always read; guest data is not.
  useEffect(() => {
    let active = true;
    fetch('/api/connections')
      .then((response) => (response.ok ? (response.json() as Promise<Connection[]>) : []))
      .then((rows) => {
        if (!active) return;
        setConnections(
          rows
            .filter((row) => hasInventoryDomain(row.type, 'hosts'))
            .map(({ id, name }) => ({ id, name })),
        );
        setConnectionsLoaded(true);
      })
      .catch(() => {
        if (active) setConnectionsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async (id: number, refresh = false, silent = false) => {
    requested.current.add(id);
    if (!silent) setInventories((current) => ({ ...current, [id]: { status: 'loading' } }));
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
  // Re-reads the (30 s cached) inventory once a minute, like the monitor status, so the offline
  // banner follows reality. A failed refresh turns the state into "unknown", never "offline".
  useEffect(() => {
    if (!key) return;
    const timer = window.setInterval(
      () => key.split(',').forEach((id) => void load(Number(id), false, true)),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, [key, load]);

  return { connections, connectionsLoaded, inventories, reload: load };
}
