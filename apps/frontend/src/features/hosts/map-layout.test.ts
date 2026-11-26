import { expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { buildHostView, type HostInventories } from './hosts';
import {
  MAP,
  ZOOM,
  clampZoom,
  fitZoom,
  focusOrder,
  layoutForViewport,
  layoutGroups,
  layoutMap,
  looseColumns,
  type MapRect,
} from './map-layout';

const card = (id: number, name: string, vmid?: number, node = 'pve1'): Service => ({
  id,
  name,
  url: `https://${name}.test`,
  category: 'Home',
  description: '',
  host: vmid ? { connectionId: 1, node, vmid, type: 'lxc' } : null,
});
const inventories: HostInventories = {
  1: {
    status: 'ready',
    nodes: [
      { name: 'pve1', status: 'online' },
      { name: 'pve2', status: 'offline' },
      { name: 'pve3', status: 'online' },
    ],
    guests: [100, 101, 102, 103, 104].map((vmid) => ({
      vmid,
      name: `g${vmid}`,
      type: 'lxc' as const,
      node: vmid < 103 ? 'pve1' : vmid === 103 ? 'pve2' : 'pve3',
      status: 'running',
    })),
  },
};
const connections = [{ id: 1, name: 'Lab' }];
const services = [
  card(1, 'a', 100),
  card(2, 'b', 100),
  card(3, 'c', 101),
  card(4, 'd', 102),
  card(5, 'e', 103, 'pve2'),
  card(6, 'f', 104, 'pve3'),
  card(7, 'gone', 999),
  card(8, 'free'),
];
const model = () => buildHostView(services, connections, inventories);
const overlaps = (a: MapRect, b: MapRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (child: MapRect, parent: MapRect) =>
  child.x >= parent.x &&
  child.y >= parent.y &&
  child.x + child.w <= parent.x + parent.w &&
  child.y + child.h <= parent.y + parent.h;

it('is deterministic: the same input gives the same layout', () => {
  expect(layoutMap(model())).toEqual(layoutMap(model()));
});

it('keeps guests inside nodes and services inside guests, with no overlaps', () => {
  const layout = layoutMap(model());
  for (const container of layout.containers) {
    expect(inside(container, { x: 0, y: 0, w: layout.width, h: layout.height })).toBe(true);
    for (const guest of container.guests) {
      expect(inside(guest, container)).toBe(true);
      for (const item of guest.services) expect(inside(item, guest)).toBe(true);
    }
    for (const item of container.services) expect(inside(item, container)).toBe(true);
  }
  layout.containers.forEach((a, i) =>
    layout.containers.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
  );
  const all = layout.containers.flatMap((container) => container.guests);
  all.forEach((a, i) =>
    all.slice(i + 1).forEach((b) => {
      if (a.y >= 0) expect(overlaps(a, b)).toBe(false);
    }),
  );
});

it('wraps containers into rows and puts unlinked services in their own container', () => {
  const layout = layoutMap(model());
  expect(layout.containers.map((container) => container.kind)).toEqual([
    'node',
    'node',
    'node',
    'notFound',
    'unlinked',
  ]);
  expect(Math.max(...layout.containers.map((c) => c.x + c.w))).toBeLessThanOrEqual(
    Math.max(MAP.rowWidth, ...layout.containers.map((c) => c.w)),
  );
  expect(layout.containers.some((container) => container.y > 0)).toBe(true);
});

it('visits services in the same order as the Host view', () => {
  const host = model();
  const expected = [
    ...host.nodes.flatMap((node) =>
      node.guests.flatMap((group) => group.services.map((service) => service.id)),
    ),
    ...host.notFound.map((service) => service.id),
    ...host.unavailable.map((service) => service.id),
    ...host.unlinked.map((service) => service.id),
  ];
  expect(focusOrder(layoutMap(host))).toEqual(expected);
});

it('handles an empty model and bounds the zoom between 0.6 and 1.2', () => {
  const empty = layoutMap(buildHostView([], connections, inventories));
  expect(empty).toEqual({ width: 0, height: 0, containers: [] });
  expect(fitZoom(empty, 800, 600)).toBe(ZOOM.default);
  expect(clampZoom(0.1)).toBe(0.6);
  expect(clampZoom(9)).toBe(1.2);
  const layout = layoutMap(model());
  expect(fitZoom(layout, 100, 100)).toBe(0.6);
  expect(fitZoom(layout, 100_000, 100_000)).toBe(1.2);
});

it('spreads many unlinked services over a grid instead of one tall column', () => {
  const many = Array.from({ length: 13 }, (_, i) => card(100 + i, `free${i}`));
  const layout = layoutMap(buildHostView(many, connections, inventories));
  const [container] = layout.containers;
  expect(looseColumns(13)).toBe(3);
  expect(new Set(container.services.map((item) => item.x)).size).toBe(3);
  for (const item of container.services) expect(inside(item, container)).toBe(true);
  container.services.forEach((a, i) =>
    container.services.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
  );
});

const tall = (): HostInventories => ({
  1: {
    status: 'ready',
    nodes: [{ name: 'pve1', status: 'online' }],
    guests: [100, 101, 102].map((vmid) => ({
      vmid,
      name: `g${vmid}`,
      type: 'lxc' as const,
      node: 'pve1',
      status: 'running',
    })),
  },
});

it('places each guest in the shortest column, so a tall guest does not stretch its neighbour', () => {
  const crowded = [
    card(1, 'a', 100),
    card(2, 'b', 100),
    card(3, 'c', 100),
    card(4, 'd', 101),
    card(5, 'e', 102),
  ];
  const [node] = layoutMap(buildHostView(crowded, connections, tall())).containers;
  const [first, second, third] = node!.guests;
  expect(first!.h).toBeGreaterThan(second!.h);
  // g100 is tall and sits in the left column, g101 beside it, g102 under the shorter g101.
  expect(second!.x).toBeGreaterThan(first!.x);
  expect(third!.x).toBe(second!.x);
  expect(third!.y).toBe(second!.y + second!.h + MAP.guestGap);
  // The Host view order is kept whatever the position.
  expect(node!.guests.map((guest) => guest.group.guest.vmid)).toEqual([100, 101, 102]);
});

it('draws a collapsed guest as its header only and keeps its services in the model', () => {
  const crowded = [card(1, 'a', 100), card(2, 'b', 100), card(3, 'c', 101)];
  const view = buildHostView(crowded, connections, tall());
  const open = layoutMap(view).containers[0]!.guests[0]!;
  const closed = layoutMap(view, { collapsed: new Set([open.group.key]) }).containers[0]!
    .guests[0]!;
  expect(closed.collapsed).toBe(true);
  expect(closed.services).toEqual([]);
  expect(closed.h).toBe(MAP.guestHeader + MAP.guestPad);
  expect(closed.group.services).toHaveLength(2);
  expect(open.h).toBeGreaterThan(closed.h);
});

it('puts services marked external in their own container, before Not linked', () => {
  const all = [card(1, 'a', 100), { ...card(2, 'vpn'), hostExternal: true }, card(3, 'free')];
  const containers = layoutMap(buildHostView(all, connections, tall())).containers;
  expect(containers.map((container) => container.kind)).toEqual(['node', 'external', 'unlinked']);
  expect(containers[1]!.services.map((item) => item.service.name)).toEqual(['vpn']);
});

it('lays services out by dashboard group, in the order given', () => {
  const grouped = [
    { ...card(1, 'a'), category: 'Media' },
    { ...card(2, 'b'), category: 'Essentials' },
    { ...card(3, 'c'), category: 'Media' },
  ];
  const layout = layoutGroups(grouped, ['Essentials', 'Media']);
  expect(layout.containers.map((container) => container.title)).toEqual(['Essentials', 'Media']);
  expect(layout.containers[1]!.services.map((item) => item.service.name)).toEqual(['a', 'c']);
  expect(layout.containers.every((container) => container.kind === 'group')).toBe(true);
  expect(layoutGroups(grouped, ['Essentials', 'Media'])).toEqual(layout);
  // Groups that are not in the order come after, by name.
  expect(layoutGroups(grouped, []).containers.map((container) => container.title)).toEqual([
    'Essentials',
    'Media',
  ]);
});

it('widens or narrows the rows to suit the window', () => {
  const wide = layoutForViewport(model(), {}, 2400, 900);
  const narrow = layoutForViewport(model(), {}, 900, 900);
  expect(fitZoom(wide, 2400, 900)).toBeGreaterThanOrEqual(fitZoom(layoutMap(model()), 2400, 900));
  expect(narrow.width).toBeLessThanOrEqual(wide.width);
});
