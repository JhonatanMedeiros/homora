import { expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { buildHostView, type HostInventories } from './hosts';
import { fold, groupTileView, mapView, type MapFilter } from './host-map-filter';
import type { Health } from './host-health';

const card = (id: number, name: string, vmid?: number, patch: Partial<Service> = {}): Service => ({
  id,
  name,
  url: `https://${name}.test`,
  category: 'Home',
  description: '',
  host: vmid ? { connectionId: 1, node: 'pve1', vmid, type: 'lxc' } : null,
  ...patch,
});
const connections = [{ id: 1, name: 'Lab' }];
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [{ name: 'pve1', status: 'online' }],
    guests: [
      { vmid: 100, name: 'café', type: 'lxc', node: 'pve1', status: 'running' },
      { vmid: 101, name: 'media', type: 'lxc', node: 'pve1', status: 'running' },
    ],
  },
};
const services = [
  card(1, 'pihole', 100),
  card(2, 'jellyfin', 101),
  card(3, 'notes'),
  card(4, 'vpn', undefined, { hostExternal: true }),
  card(5, 'gone', 999),
];
const health: Record<number, Health> = { 1: 'down', 2: 'ok', 3: 'ok', 4: 'ok', 5: 'ok' };
const healthOf = (service: Service) => health[service.id]!;
const model = buildHostView(services, connections, inventories);
const run = (patch: Partial<Parameters<typeof mapView>[0]> = {}) =>
  mapView({
    model,
    services,
    healthOf,
    filter: 'all' as MapFilter,
    query: '',
    collapseHealthy: false,
    overrides: new Map(),
    ...patch,
  });
const guestKey = (vmid: number) =>
  model.nodes[0]!.guests.find((group) => group.guest.vmid === vmid)!.key;

it('folds accents and case so a search finds what was meant', () => {
  expect(fold('  Café ')).toBe('  cafe ');
  expect(fold('ÇÃO')).toBe('cao');
});

it('counts all, problems and the ones that still need a host', () => {
  expect(run().counts).toEqual({ all: 5, problems: 1, unlinked: 2 });
});

it('draws everything normally with no filter, no search and healthy collapsing off', () => {
  const view = run();
  expect(view.collapsed.size).toBe(0);
  expect(view.dimmedGuests.size + view.dimmedNodes.size + view.dimmedContainers.size).toBe(0);
  expect(view.matches).toBeNull();
});

it('collapses and mutes healthy guests in the Problems filter, never removing them', () => {
  const view = run({ filter: 'problems' });
  expect([...view.collapsed]).toEqual([guestKey(101)]);
  expect(view.dimmedGuests.has(guestKey(101))).toBe(true);
  expect(view.dimmedGuests.has(guestKey(100))).toBe(false);
  // The node holds the failing service, so it stays in focus.
  expect(view.dimmedNodes.size).toBe(0);
  // Containers with nothing wrong are muted; the services in them too.
  expect([...view.dimmedContainers].sort()).toEqual(['external', 'notFound', 'unlinked']);
  expect(view.dimmedServices.has(3)).toBe(true);
  expect(view.dimmedServices.has(1)).toBe(false);
});

it('focuses the services that need a host in the Not linked filter', () => {
  const view = run({ filter: 'unlinked' });
  expect(view.dimmedNodes.size).toBe(1);
  expect(view.dimmedContainers.has('unlinked')).toBe(false);
  expect(view.dimmedContainers.has('notFound')).toBe(false);
  expect(view.dimmedContainers.has('external')).toBe(true);
});

it('collapses healthy guests when asked, but a hand-made choice wins over the rule', () => {
  expect([...run({ collapseHealthy: true }).collapsed]).toEqual([guestKey(101)]);
  const opened = run({ collapseHealthy: true, overrides: new Map([[guestKey(101), false]]) });
  expect(opened.collapsed.size).toBe(0);
  const closed = run({ overrides: new Map([[guestKey(100), true]]) });
  expect([...closed.collapsed]).toEqual([guestKey(100)]);
});

it('finds services by name, address or guest, ignoring accents, and mutes the rest', () => {
  const byName = run({ query: 'JELLY' });
  expect([...byName.matches!]).toEqual([2]);
  expect(byName.dimmedGuests.has(guestKey(100))).toBe(true);
  expect(byName.dimmedGuests.has(guestKey(101))).toBe(false);
  expect(byName.dimmedServices.has(1)).toBe(true);
  // A guest name matches even though no service does, and its services stay readable.
  const byGuest = run({ query: 'cafe' });
  expect(byGuest.dimmedGuests.has(guestKey(100))).toBe(false);
  expect(byGuest.dimmedGuests.has(guestKey(101))).toBe(true);
  expect(run({ query: 'notes.test' }).matches).toEqual(new Set([3]));
});

it('opens a collapsed guest that holds a match', () => {
  const view = run({
    query: 'jelly',
    collapseHealthy: true,
    overrides: new Map([[guestKey(101), true]]),
  });
  expect(view.collapsed.has(guestKey(101))).toBe(false);
});

it('applies the same filters to services grouped by dashboard group', () => {
  const problems = groupTileView(services, healthOf, 'problems', '');
  expect([...problems.dimmed].sort()).toEqual([2, 3, 4, 5]);
  const unlinked = groupTileView(services, healthOf, 'unlinked', '');
  expect([...unlinked.dimmed].sort()).toEqual([1, 2, 4, 5]);
  const found = groupTileView(services, healthOf, 'all', 'notes');
  expect(found.matches).toEqual(new Set([3]));
  expect(found.groups).toEqual(new Set(['Home']));
});
