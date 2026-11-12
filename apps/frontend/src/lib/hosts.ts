import type { GuestType, HostLink, Service } from '@homora/shared';

export type HostConnection = { id: number; name: string };
export type HostNode = { name: string; status: 'online' | 'offline' | 'unknown' };
export type HostGuest = {
  vmid: number;
  name: string;
  type: GuestType;
  node: string;
  status: string;
};
/** Inventory of one connection as loaded by the browser. Names stay in memory only. */
export type HostInventory =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; nodes: HostNode[]; guests: HostGuest[] };
export type HostInventories = Record<number, HostInventory | undefined>;

export function findGuest(
  inventory: HostInventory | undefined,
  link: HostLink,
): HostGuest | undefined {
  if (inventory?.status !== 'ready') return undefined;
  return inventory.guests.find(
    (guest) => guest.node === link.node && guest.vmid === link.vmid && guest.type === link.type,
  );
}

export type HostGuestGroup = { key: string; guest: HostGuest; services: Service[] };
export type HostNodeGroup = {
  key: string;
  connectionId: number;
  connectionName: string;
  node: HostNode;
  guests: HostGuestGroup[];
  count: number;
};
export type HostViewModel = {
  nodes: HostNodeGroup[];
  /** Linked, but the guest no longer exists in a loaded inventory. */
  notFound: Service[];
  /** Linked, but the inventory could not be read (or is still loading). */
  unavailable: Service[];
  unlinked: Service[];
};

const byName = (a: Service, b: Service) => a.name.localeCompare(b.name);

/**
 * Groups cards by connection, node and guest. Only ids are stored on cards, so guest names come
 * from the live inventory. A guest that vanished degrades to "not found"; an unreadable
 * inventory degrades to "unavailable" (never to "offline").
 */
export function buildHostView(
  services: Service[],
  connections: HostConnection[],
  inventories: HostInventories,
): HostViewModel {
  const model: HostViewModel = { nodes: [], notFound: [], unavailable: [], unlinked: [] };
  const nodes = new Map<string, HostNodeGroup>();
  const guests = new Map<string, HostGuestGroup>();
  for (const service of [...services].sort(byName)) {
    const link = service.host;
    if (!link) {
      model.unlinked.push(service);
      continue;
    }
    const connection = connections.find((item) => item.id === link.connectionId);
    const inventory = inventories[link.connectionId];
    if (!connection || inventory?.status !== 'ready') {
      model.unavailable.push(service);
      continue;
    }
    const guest = findGuest(inventory, link);
    if (!guest) {
      model.notFound.push(service);
      continue;
    }
    const nodeKey = `${connection.id}:${guest.node}`;
    let node = nodes.get(nodeKey);
    if (!node) {
      node = {
        key: nodeKey,
        connectionId: connection.id,
        connectionName: connection.name,
        node: inventory.nodes.find((item) => item.name === guest.node) ?? {
          name: guest.node,
          status: 'unknown',
        },
        guests: [],
        count: 0,
      };
      nodes.set(nodeKey, node);
      model.nodes.push(node);
    }
    const guestKey = `${nodeKey}:${guest.type}:${guest.vmid}`;
    let group = guests.get(guestKey);
    if (!group) {
      group = { key: guestKey, guest, services: [] };
      guests.set(guestKey, group);
      node.guests.push(group);
    }
    group.services.push(service);
    node.count++;
  }
  model.nodes.sort(
    (a, b) =>
      a.connectionName.localeCompare(b.connectionName) || a.node.name.localeCompare(b.node.name),
  );
  for (const node of model.nodes) node.guests.sort((a, b) => a.guest.vmid - b.guest.vmid);
  return model;
}

/** Short label of where a card runs, or null when it is not linked. */
export type HostLabel =
  { kind: 'found'; guest: HostGuest } | { kind: 'missing' } | { kind: 'unavailable' };
export function hostLabel(
  service: Service,
  connections: HostConnection[],
  inventories: HostInventories,
): HostLabel | null {
  const link = service.host;
  if (!link) return null;
  const inventory = inventories[link.connectionId];
  if (!connections.some((item) => item.id === link.connectionId) || inventory?.status !== 'ready')
    return { kind: 'unavailable' };
  const guest = findGuest(inventory, link);
  return guest ? { kind: 'found', guest } : { kind: 'missing' };
}

/**
 * Why a linked card may be affected. `unknown` means the Proxmox inventory could not be read:
 * it is never reported as offline. A monitor failure on a running guest is a different cause
 * (`service-down`) from a stopped guest or an offline node.
 */
export type Impact = 'none' | 'ok' | 'host-offline' | 'guest-stopped' | 'service-down' | 'unknown';

export function serviceImpact(
  service: Service,
  availability: 'available' | 'unavailable' | 'unknown' | undefined,
  blocked: boolean,
  connections: HostConnection[],
  inventories: HostInventories,
): Impact {
  const link = service.host;
  if (!link) return 'none';
  const inventory = inventories[link.connectionId];
  if (!connections.some((item) => item.id === link.connectionId) || inventory?.status !== 'ready')
    return 'unknown';
  if (inventory.nodes.find((node) => node.name === link.node)?.status === 'offline')
    return 'host-offline';
  const guest = findGuest(inventory, link);
  if (!guest) return 'unknown';
  if (guest.status !== 'running') return guest.status === 'stopped' ? 'guest-stopped' : 'unknown';
  return availability === 'unavailable' && !blocked ? 'service-down' : 'ok';
}

export type OfflineNode = {
  connectionId: number;
  connectionName: string;
  node: string;
  affected: Service[];
};

/** Offline nodes that have linked cards, from a successfully read inventory only. */
export function offlineNodes(
  services: Service[],
  connections: HostConnection[],
  inventories: HostInventories,
): OfflineNode[] {
  const result: OfflineNode[] = [];
  for (const connection of connections) {
    const inventory = inventories[connection.id];
    if (inventory?.status !== 'ready') continue;
    for (const node of inventory.nodes) {
      if (node.status !== 'offline') continue;
      const affected = services.filter(
        (service) =>
          service.host?.connectionId === connection.id && service.host.node === node.name,
      );
      if (affected.length)
        result.push({
          connectionId: connection.id,
          connectionName: connection.name,
          node: node.name,
          affected,
        });
    }
  }
  return result.sort((a, b) => a.node.localeCompare(b.node));
}
