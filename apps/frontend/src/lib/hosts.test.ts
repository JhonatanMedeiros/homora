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
