import { expect, it } from 'vitest';
import { inventoryProxmox } from './inventory.js';

const node = (extra: object = {}) => ({ type: 'node', node: 'pve1', status: 'online', ...extra });
const guest = (extra: object = {}) => ({
  type: 'lxc',
  vmid: 101,
  name: 'web',
  node: 'pve1',
  status: 'running',
  ...extra,
});

it('reads the load of an online node, with the disk', () => {
  const { nodes } = inventoryProxmox([
    node({ cpu: 0.25, maxcpu: 8, mem: 4_000, maxmem: 16_000, disk: 10, maxdisk: 100 }),
  ]);
  expect(nodes[0]?.metrics).toEqual({
    cpu: 0.25,
    memory: { used: 4_000, total: 16_000 },
    disk: { used: 10, total: 100 },
  });
});

it('reads the CPU and memory of a running guest but never its disk', () => {
  const { guests } = inventoryProxmox([
    guest({ cpu: 0.05, mem: 512, maxmem: 2_048, disk: 0, maxdisk: 8_000 }),
  ]);
  expect(guests[0]?.metrics).toEqual({ cpu: 0.05, memory: { used: 512, total: 2_048 } });
});

it('omits the load of an offline node and of a stopped guest instead of reporting zero', () => {
  const inventory = inventoryProxmox([
    node({ node: 'pve2', status: 'offline', cpu: 0, mem: 0, maxmem: 1_000 }),
    guest({ status: 'stopped', cpu: 0, mem: 0, maxmem: 1_000 }),
  ]);
  expect(inventory.nodes[0]).toEqual({ name: 'pve2', status: 'offline' });
  expect(inventory.guests[0]).not.toHaveProperty('metrics');
});

it('drops invalid values one by one and keeps the valid ones', () => {
  const { nodes } = inventoryProxmox([
    node({ cpu: 'high', mem: -1, maxmem: 1_000, disk: 5, maxdisk: 0 }),
    node({ node: 'pve2', cpu: Number.NaN, mem: 10, maxmem: 100 }),
  ]);
  expect(nodes[0]).toEqual({ name: 'pve1', status: 'online' });
  expect(nodes[1]?.metrics).toEqual({ memory: { used: 10, total: 100 } });
});

it('caps a fraction above one and a usage above its total', () => {
  const { nodes } = inventoryProxmox([node({ cpu: 1.7, mem: 5_000, maxmem: 1_000 })]);
  expect(nodes[0]?.metrics).toEqual({ cpu: 1, memory: { used: 1_000, total: 1_000 } });
});
