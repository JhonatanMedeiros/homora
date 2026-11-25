import { expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { buildHostView, hostLabel, type HostInventories } from './hosts';

const link = (vmid: number, node = 'pve1', type: 'lxc' | 'qemu' = 'lxc') => ({
  connectionId: 1,
  node,
  vmid,
  type,
});
const card = (id: number, name: string, host?: Service['host']): Service => ({
  id,
  name,
  url: `https://${name}.test`,
  category: 'Home',
  description: '',
  host: host ?? null,
});
const connections = [{ id: 1, name: 'Lab' }];
const ready: HostInventories = {
  1: {
    status: 'ready',
    nodes: [
      { name: 'pve1', status: 'online' },
      { name: 'pve2', status: 'offline' },
    ],
    guests: [
      { vmid: 101, name: 'dns', type: 'lxc', node: 'pve1', status: 'running' },
      { vmid: 100, name: 'nas', type: 'qemu', node: 'pve1', status: 'stopped' },
      { vmid: 200, name: 'media', type: 'qemu', node: 'pve2', status: 'stopped' },
    ],
  },
};

it('groups cards by node and guest, with unlinked cards in their own section', () => {
  const model = buildHostView(
    [
      card(1, 'pihole', link(101)),
      card(2, 'adguard', link(101)),
      card(3, 'samba', link(100, 'pve1', 'qemu')),
      card(4, 'jellyfin', link(200, 'pve2', 'qemu')),
      card(5, 'notes'),
    ],
    connections,
    ready,
  );
  expect(model.nodes.map((node) => [node.node.name, node.node.status, node.count])).toEqual([
    ['pve1', 'online', 3],
    ['pve2', 'offline', 1],
  ]);
  expect(model.nodes[0].guests.map((group) => group.guest.vmid)).toEqual([100, 101]);
  expect(model.nodes[0].guests[1].services.map((service) => service.name)).toEqual([
    'adguard',
    'pihole',
  ]);
  expect(model.unlinked.map((service) => service.name)).toEqual(['notes']);
  expect(model.notFound).toEqual([]);
});

it('degrades a deleted guest to not found and an unreadable inventory to unavailable', () => {
  const cards = [card(1, 'gone', link(999)), card(2, 'ok', link(101))];
  const missing = buildHostView(cards, connections, ready);
  expect(missing.notFound.map((service) => service.name)).toEqual(['gone']);
  expect(missing.nodes).toHaveLength(1);

  const failed = buildHostView(cards, connections, { 1: { status: 'error' } });
  expect(failed.unavailable.map((service) => service.name)).toEqual(['gone', 'ok']);
  expect(failed.nodes).toEqual([]);
  expect(failed.notFound).toEqual([]);
});

it('resolves the label from the live inventory so renames follow', () => {
  const service = card(1, 'pihole', link(101));
  expect(hostLabel(service, connections, ready)).toMatchObject({
    kind: 'found',
    guest: { name: 'dns' },
  });
  const renamed: HostInventories = {
    1: {
      ...(ready[1] as Extract<HostInventories[number], { status: 'ready' }>),
      guests: [{ vmid: 101, name: 'dns-primary', type: 'lxc', node: 'pve1', status: 'running' }],
    },
  };
  expect(hostLabel(service, connections, renamed)).toMatchObject({
    guest: { name: 'dns-primary' },
  });
  expect(hostLabel(card(2, 'x', link(5)), connections, ready)).toEqual({ kind: 'missing' });
  expect(hostLabel(service, connections, {})).toEqual({ kind: 'unavailable' });
  expect(hostLabel(card(3, 'free'), connections, ready)).toBeNull();
});

import { hostRailItems, offlineNodes, serviceImpact } from './hosts';

it('computes impact: online, offline node, stopped guest, down service, connection error, unlinked', () => {
  const impact = (service: Service, availability: 'available' | 'unavailable', inv = ready) =>
    serviceImpact(service, availability, false, connections, inv);
  expect(impact(card(1, 'a', link(101)), 'available')).toBe('ok');
  expect(impact(card(1, 'a'), 'available')).toBe('none');
  expect(impact(card(2, 'b', link(200, 'pve2', 'qemu')), 'unavailable')).toBe('host-offline');
  expect(impact(card(3, 'c', link(100, 'pve1', 'qemu')), 'unavailable')).toBe('guest-stopped');
  expect(impact(card(4, 'd', link(101)), 'unavailable')).toBe('service-down');
  expect(serviceImpact(card(4, 'd', link(101)), 'unavailable', true, connections, ready)).toBe(
    'ok',
  );
  // An unreadable or loading inventory is "unknown", never "offline".
  expect(impact(card(5, 'e', link(101)), 'unavailable', { 1: { status: 'error' } })).toBe(
    'unknown',
  );
  expect(impact(card(5, 'e', link(101)), 'unavailable', {})).toBe('unknown');
  expect(impact(card(6, 'f', link(999)), 'unavailable')).toBe('unknown');
});

it('lists offline nodes with their affected cards and ignores unreadable inventories', () => {
  const cards = [
    card(1, 'a', link(200, 'pve2', 'qemu')),
    card(2, 'b', link(201, 'pve2', 'qemu')),
    card(3, 'c', link(101)),
  ];
  const found = offlineNodes(cards, connections, ready);
  expect(found).toHaveLength(1);
  expect(found[0].node).toBe('pve2');
  expect(found[0].affected.map((s) => s.name)).toEqual(['a', 'b']);
  expect(offlineNodes(cards, connections, { 1: { status: 'error' } })).toEqual([]);
});

it('lists nodes with linked cards for the rail, with how many are down', () => {
  const cards = [
    card(1, 'a', link(200, 'pve2', 'qemu')),
    card(2, 'b', link(201, 'pve2', 'qemu')),
    card(3, 'c', link(101)),
  ];
  const items = hostRailItems(cards, connections, ready, (service) => service.id === 2);
  expect(items.map((item) => [item.node, item.state, item.total, item.down])).toEqual([
    ['pve1', 'online', 1, 0],
    ['pve2', 'offline', 2, 1],
  ]);
  // Nodes with no linked card, and unreadable inventories, add nothing.
  expect(hostRailItems([card(9, 'z')], connections, ready, () => false)).toEqual([]);
  expect(hostRailItems(cards, connections, { 1: { status: 'error' } }, () => false)).toEqual([]);
});

it('keeps services marked external apart from the ones that still need a host', () => {
  const all = [{ ...card(1, 'vpn'), hostExternal: true }, card(2, 'free'), card(3, 'a', link(101))];
  const model = buildHostView(all, connections, ready);
  expect(model.external.map((service) => service.name)).toEqual(['vpn']);
  expect(model.unlinked.map((service) => service.name)).toEqual(['free']);
});

it('orders services with a custom comparison and breaks ties by name', () => {
  const all = [card(1, 'b', link(101)), card(2, 'a', link(101)), card(3, 'c', link(101))];
  const failing = (service: Service) => (service.name === 'c' ? 0 : 1);
  const model = buildHostView(all, connections, ready, (a, b) => failing(a) - failing(b));
  const group = model.nodes[0]!.guests.find((item) => item.guest.vmid === 101)!;
  expect(group.services.map((service) => service.name)).toEqual(['c', 'a', 'b']);
});
