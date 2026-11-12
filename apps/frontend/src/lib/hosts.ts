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
