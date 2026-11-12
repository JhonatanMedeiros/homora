import { expect, it } from 'vitest';
import type { Service } from '@homora/shared';
import { buildHostView, type HostInventories } from './hosts';
import {
  MAP,
  ZOOM,
  clampZoom,
  fitZoom,
  focusOrder,
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
