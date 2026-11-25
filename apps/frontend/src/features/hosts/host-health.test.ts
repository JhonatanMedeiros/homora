import { expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { buildHostView, type HostInventories } from './hosts';
import {
  countHealth,
  cpuPercent,
  guestSummary,
  healthCompare,
  healthRank,
  isProblem,
  nodeSummary,
  serviceHealth,
  usagePercent,
  type Health,
} from './host-health';

const card = (id: number, name: string, vmid: number, node = 'pve1'): Service => ({
  id,
  name,
  url: `https://${name}.test`,
  category: 'Home',
  description: '',
  host: { connectionId: 1, node, vmid, type: 'lxc' },
});
const inventories = (stopped = false, offline = false): HostInventories => ({
  1: {
    status: 'ready',
    nodes: [{ name: 'pve1', status: offline ? 'offline' : 'online' }],
    guests: [
      { vmid: 100, name: 'g100', type: 'lxc', node: 'pve1', status: 'running' },
      {
        vmid: 101,
        name: 'g101',
        type: 'lxc',
        node: 'pve1',
        status: stopped ? 'stopped' : 'running',
      },
    ],
  },
});
const connections = [{ id: 1, name: 'Lab' }];
const health: Record<number, Health> = { 1: 'ok', 2: 'down', 3: 'degraded', 4: 'ok', 5: 'unknown' };
const healthOf = (service: Service) => health[service.id] ?? 'unknown';
const services = [
  card(1, 'a', 100),
  card(2, 'b', 100),
  card(3, 'c', 100),
  card(4, 'd', 101),
  card(5, 'e', 101),
];

it('reads health from the same status text rules as the rest of the app', () => {
  const at = (status: 'available' | 'unavailable' | 'unknown', patch = {}) =>
    serviceHealth({ status, lastAttempt: null, ...patch }, false);
  expect(at('available')).toBe('ok');
  expect(at('unavailable')).toBe('down');
  expect(at('unknown')).toBe('unknown');
  expect(serviceHealth(undefined, false)).toBe('unknown');
  // A blocked check is never presented as healthy or as down.
  expect(serviceHealth({ status: 'unavailable', lastAttempt: null }, true)).toBe('unknown');
});

it('ranks problems first and counts every state', () => {
  expect(['ok', 'down', 'unknown', 'degraded'].map((item) => healthRank(item as Health))).toEqual([
    2, 0, 2, 1,
  ]);
  expect(isProblem('down') && isProblem('degraded')).toBe(true);
  expect(isProblem('ok') || isProblem('unknown')).toBe(false);
  expect(countHealth(services, healthOf)).toEqual({
    total: 5,
    ok: 2,
    degraded: 1,
    down: 1,
    unknown: 1,
  });
  const sorted = [...services].sort(healthCompare(healthOf)).map((service) => service.name);
  expect(sorted.slice(0, 2)).toEqual(['b', 'c']);
});

it('summarises a guest: a failing service, or a stopped guest, is a problem', () => {
  const [node] = buildHostView(services, connections, inventories()).nodes;
  const [first, second] = node!.guests.map((group) => guestSummary(group, healthOf));
  expect(first).toMatchObject({ problem: true, running: true });
  expect(first!.counts).toMatchObject({ total: 3, down: 1, degraded: 1 });
  // Its only failure is an unknown service, which is not a problem by itself.
  expect(second).toMatchObject({ problem: false, running: true });
  const [stopped] = buildHostView([card(4, 'd', 101)], connections, inventories(true)).nodes;
  expect(guestSummary(stopped!.guests[0]!, () => 'ok')).toMatchObject({
    problem: true,
    running: false,
  });
});

it('summarises a node: online, degraded by a problem below it, offline, unknown', () => {
  const node = (online: boolean, offline = false) =>
    buildHostView(services, connections, inventories(false, offline)).nodes[0]!;
  expect(nodeSummary(node(true), healthOf)).toMatchObject({ state: 'degraded', problem: true });
  expect(nodeSummary(node(true), () => 'ok')).toMatchObject({ state: 'online', problem: false });
  expect(nodeSummary(node(false, true), () => 'ok')).toMatchObject({
    state: 'offline',
    problem: true,
  });
  expect(nodeSummary(node(true), healthOf).counts.total).toBe(5);
});

it('turns metrics into whole percents and omits what is missing', () => {
  expect(cpuPercent(0.126)).toBe(13);
  expect(cpuPercent(undefined)).toBeNull();
  expect(cpuPercent(3)).toBe(100);
  expect(usagePercent({ used: 1, total: 4 })).toBe(25);
  expect(usagePercent({ used: 1, total: 0 })).toBeNull();
  expect(usagePercent(undefined)).toBeNull();
});
