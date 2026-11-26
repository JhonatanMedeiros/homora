import type { Service } from '@homora/shared';
import type { HostGuestGroup, HostNodeGroup, HostViewModel } from '@/features/hosts/hosts';

/** Geometry in map units (CSS px at zoom 1). Everything is computed, nothing is stored. */
export const MAP = {
  serviceW: 240,
  serviceH: 40,
  /** Tiles outside a guest carry a second line (address or suggested host). */
  looseH: 50,
  serviceGap: 6,
  guestPad: 10,
  /** Name and state, then type and id, then the CPU and memory meters. */
  guestHeader: 72,
  guestGap: 12,
  nodePad: 14,
  /** Name and state, then the health summary and the load meters. */
  nodeHeader: 64,
  nodeGap: 20,
  /** Containers wrap to a new row once a row would pass this width. */
  rowWidth: 1700,
  /** Guests of a node are placed in this many columns, each in the shortest one. */
  guestColumns: 2,
  minGuestW: 208,
} as const;
export const ZOOM = { min: 0.6, max: 1.2, step: 0.1, default: 1 } as const;

export type MapRect = { x: number; y: number; w: number; h: number };
export type MapService = MapRect & { service: Service };
export type MapGuest = MapRect & {
  group: HostGuestGroup;
  services: MapService[];
  /** Only the header is drawn; the services stay in the list but take no room. */
  collapsed: boolean;
};
export type MapContainer = MapRect & {
  kind: 'node' | 'notFound' | 'unavailable' | 'external' | 'unlinked' | 'group';
  id: string;
  /** Name of a `group` container (the dashboard group). */
  title?: string;
  node?: HostNodeGroup;
  guests: MapGuest[];
  /** Loose services of every container that has no guest. */
  services: MapService[];
};
export type MapLayout = {
  width: number;
  height: number;
  containers: MapContainer[];
};

export type LayoutOptions = {
  /** Keys of the guests drawn collapsed. */
  collapsed?: ReadonlySet<string>;
  /** Where a row of containers wraps; `MAP.rowWidth` when not given. */
  rowWidth?: number;
};

const guestWidth = MAP.serviceW + MAP.guestPad * 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const clampZoom = (value: number) =>
  Math.round(clamp(value, ZOOM.min, ZOOM.max) * 100) / 100;

function layoutServices(services: Service[], x: number, y: number): MapService[] {
  return services.map((service, index) => ({
    service,
    x,
    y: y + index * (MAP.serviceH + MAP.serviceGap),
    w: MAP.serviceW,
    h: MAP.serviceH,
  }));
}
const stackHeight = (count: number, tile: number) =>
  count ? count * tile + (count - 1) * MAP.serviceGap : 0;
const servicesHeight = (count: number) => stackHeight(count, MAP.serviceH);

const guestHeight = (group: HostGuestGroup, collapsed: boolean) =>
  MAP.guestHeader + (collapsed ? 0 : servicesHeight(group.services.length)) + MAP.guestPad;

/**
 * Guests go into columns, each one in the shortest column (the left one on a tie), so a tall guest
 * never stretches its neighbour. `guests` keeps the Host view order whatever the position.
 */
function layoutNode(node: HostNodeGroup, collapsedKeys: ReadonlySet<string>): MapContainer {
  const columns = Math.max(1, Math.min(MAP.guestColumns, node.guests.length));
  const bottoms: number[] = Array.from({ length: columns }, () => MAP.nodeHeader);
  const guests: MapGuest[] = node.guests.map((group) => {
    let column = 0;
    for (let index = 1; index < columns; index++)
      if (bottoms[index]! < bottoms[column]!) column = index;
    const collapsed = collapsedKeys.has(group.key);
    const x = MAP.nodePad + column * (guestWidth + MAP.guestGap);
    const y = bottoms[column]!;
    const h = guestHeight(group, collapsed);
    bottoms[column] = y + h + MAP.guestGap;
    return {
      group,
      x,
      y,
      w: guestWidth,
      h,
      collapsed,
      services: collapsed
        ? []
        : layoutServices(group.services, x + MAP.guestPad, y + MAP.guestHeader),
    };
  });
  const width = MAP.nodePad * 2 + columns * guestWidth + (columns - 1) * MAP.guestGap;
  const bottom = guests.length > 0 ? Math.max(...bottoms) - MAP.guestGap : MAP.nodeHeader;
  return {
    kind: 'node',
    id: node.key,
    node,
    x: 0,
    y: 0,
    w: Math.max(width, MAP.minGuestW + MAP.nodePad * 2),
    h: bottom + MAP.nodePad,
    guests,
    services: [],
  };
}

/** Loose services use a small grid so a long list is not one tall, narrow column. */
export const looseColumns = (count: number) => (count <= 4 ? 1 : count <= 10 ? 2 : 3);

function layoutLoose(
  kind: MapContainer['kind'],
  services: Service[],
  id: string = kind,
  title?: string,
): MapContainer {
  const columns = looseColumns(services.length);
  const rows = Math.ceil(services.length / columns);
  const items: MapService[] = services.map((service, index) => ({
    service,
    x: MAP.nodePad + (index % columns) * (MAP.serviceW + MAP.guestGap),
    y: MAP.nodeHeader + Math.floor(index / columns) * (MAP.looseH + MAP.serviceGap),
    w: MAP.serviceW,
    h: MAP.looseH,
  }));
  return {
    kind,
    id,
    ...(title !== undefined && { title }),
    x: 0,
    y: 0,
    w: MAP.nodePad * 2 + columns * MAP.serviceW + (columns - 1) * MAP.guestGap,
    h: MAP.nodeHeader + stackHeight(rows, MAP.looseH) + MAP.nodePad,
    guests: [],
    services: items,
  };
}

/** Places the containers left to right, wrapping in rows, and moves their children with them. */
function flow(containers: MapContainer[], rowWidth: number = MAP.rowWidth): MapLayout {
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const container of containers) {
    if (x > 0 && x + container.w > rowWidth) {
      x = 0;
      y += rowHeight + MAP.nodeGap;
      rowHeight = 0;
    }
    const dx = x;
    const dy = y;
    container.x = dx;
    container.y = dy;
    for (const guest of container.guests) {
      guest.x += dx;
      guest.y += dy;
      for (const item of guest.services) {
        item.x += dx;
        item.y += dy;
      }
    }
    for (const item of container.services) {
      item.x += dx;
      item.y += dy;
    }
    x += container.w + MAP.nodeGap;
    rowHeight = Math.max(rowHeight, container.h);
    width = Math.max(width, dx + container.w);
  }
  return { width, height: containers.length > 0 ? y + rowHeight : 0, containers };
}

/**
 * Deterministic automatic layout: nodes first (in the Host view order), then the
 * "host not found", "host unavailable", "external" and "not linked" containers. Containers flow
 * left to right and wrap in rows. The same input always gives the same output, and the order of
 * `containers`, `guests` and `services` is exactly the Host view order (it is the DOM and focus
 * order too).
 */
export function layoutMap(model: HostViewModel, options: LayoutOptions = {}): MapLayout {
  const collapsed = options.collapsed ?? new Set<string>();
  const containers: MapContainer[] = model.nodes.map((node) => layoutNode(node, collapsed));
  if (model.notFound.length > 0) containers.push(layoutLoose('notFound', model.notFound));
  if (model.unavailable.length > 0) containers.push(layoutLoose('unavailable', model.unavailable));
  if (model.external.length > 0) containers.push(layoutLoose('external', model.external));
  if (model.unlinked.length > 0) containers.push(layoutLoose('unlinked', model.unlinked));
  return flow(containers, options.rowWidth);
}

/**
 * The same canvas grouped by dashboard group instead of by host. Groups follow `order` (the Home
 * order), then any other group by name; services keep the order they come in.
 */
export function layoutGroups(services: Service[], order: string[] = []): MapLayout {
  const byGroup = new Map<string, Service[]>();
  for (const service of services) {
    const list = byGroup.get(service.category) ?? [];
    list.push(service);
    byGroup.set(service.category, list);
  }
  const rank = (name: string) => {
    const index = order.indexOf(name);
    return index === -1 ? order.length : index;
  };
  const names = [...byGroup.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return flow(names.map((name) => layoutLoose('group', byGroup.get(name)!, `group:${name}`, name)));
}

/** Zoom that makes the whole map fit a viewport, within the allowed range. */
export function fitZoom(layout: MapLayout, viewportWidth: number, viewportHeight: number) {
  if (!layout.width || !layout.height || viewportWidth <= 0 || viewportHeight <= 0)
    return ZOOM.default;
  return clampZoom(Math.min(viewportWidth / layout.width, viewportHeight / layout.height));
}

const ROW_WIDTHS = [MAP.rowWidth, 1100, 1350, 2100, 2500];

/**
 * The layout whose shape best matches the window: the one that can be drawn largest and, between
 * equals, the one that covers more of the width. The default row width wins a tie.
 */
export function layoutForViewport(
  model: HostViewModel,
  options: LayoutOptions,
  viewportWidth: number,
  viewportHeight: number,
): MapLayout {
  let best: { layout: MapLayout; zoom: number; cover: number } | undefined;
  for (const rowWidth of ROW_WIDTHS) {
    const layout = layoutMap(model, { ...options, rowWidth });
    const zoom = fitZoom(layout, viewportWidth, viewportHeight);
    const cover = Math.min(1, (layout.width * zoom) / viewportWidth);
    if (!best || zoom > best.zoom || (zoom === best.zoom && cover > best.cover + 0.01))
      best = { layout, zoom, cover };
  }
  return best!.layout;
}

/** Services in reading order, i.e. the order keyboard focus visits them. */
export function focusOrder(layout: MapLayout): number[] {
  const ids: number[] = [];
  for (const container of layout.containers) {
    for (const guest of container.guests)
      for (const item of guest.services) ids.push(item.service.id);
    for (const item of container.services) ids.push(item.service.id);
  }
  return ids;
}
