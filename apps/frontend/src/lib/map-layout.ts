import type { Service } from '@homora/shared';
import type { HostGuestGroup, HostNodeGroup, HostViewModel } from '@/lib/hosts';

/** Geometry in map units (CSS px at zoom 1). Everything is computed, nothing is stored. */
export const MAP = {
  serviceW: 200,
  serviceH: 36,
  serviceGap: 6,
  guestPad: 10,
  guestHeader: 52,
  guestGap: 12,
  nodePad: 14,
  nodeHeader: 52,
  nodeGap: 20,
  /** Containers wrap to a new row once a row would pass this width. */
  rowWidth: 1100,
  guestsPerRow: 2,
  minGuestW: 208,
} as const;
export const ZOOM = { min: 0.6, max: 1.2, step: 0.1, default: 1 } as const;

export type MapRect = { x: number; y: number; w: number; h: number };
export type MapService = MapRect & { service: Service };
export type MapGuest = MapRect & { group: HostGuestGroup; services: MapService[] };
export type MapContainer = MapRect & {
  kind: 'node' | 'notFound' | 'unavailable' | 'unlinked';
  id: string;
  node?: HostNodeGroup;
  guests: MapGuest[];
  /** Loose services of the not-linked containers (they have no guest). */
  services: MapService[];
};
export type MapLayout = { width: number; height: number; containers: MapContainer[] };

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
const servicesHeight = (count: number) =>
  count ? count * MAP.serviceH + (count - 1) * MAP.serviceGap : 0;

function layoutNode(node: HostNodeGroup): MapContainer {
  const columns = Math.max(1, Math.min(MAP.guestsPerRow, node.guests.length));
  const guests: MapGuest[] = [];
  let y = MAP.nodeHeader;
  for (let start = 0; start < node.guests.length; start += columns) {
    const row = node.guests.slice(start, start + columns);
    const rowHeight = Math.max(
      ...row.map((group) => MAP.guestHeader + servicesHeight(group.services.length) + MAP.guestPad),
    );
    row.forEach((group, column) => {
      const x = MAP.nodePad + column * (guestWidth + MAP.guestGap);
      guests.push({
        group,
        x,
        y,
        w: guestWidth,
        h: rowHeight,
        services: layoutServices(
          group.services.map((s) => s),
          x + MAP.guestPad,
          y + MAP.guestHeader,
        ),
      });
    });
    y += rowHeight + MAP.guestGap;
  }
  const width = MAP.nodePad * 2 + columns * guestWidth + (columns - 1) * MAP.guestGap;
  return {
    kind: 'node',
    id: node.key,
    node,
    x: 0,
    y: 0,
    w: Math.max(width, MAP.minGuestW + MAP.nodePad * 2),
    h: (guests.length ? y - MAP.guestGap : y) + MAP.nodePad,
    guests,
    services: [],
  };
}

/** Loose services use a small grid so a long list is not one tall, narrow column. */
export const looseColumns = (count: number) => (count <= 4 ? 1 : count <= 10 ? 2 : 3);

function layoutLoose(kind: MapContainer['kind'], services: Service[]): MapContainer {
  const columns = looseColumns(services.length);
  const rows = Math.ceil(services.length / columns);
  const items: MapService[] = services.map((service, index) => ({
    service,
    x: MAP.nodePad + (index % columns) * (MAP.serviceW + MAP.guestGap),
    y: MAP.nodeHeader + Math.floor(index / columns) * (MAP.serviceH + MAP.serviceGap),
    w: MAP.serviceW,
    h: MAP.serviceH,
  }));
  return {
    kind,
    id: kind,
    x: 0,
    y: 0,
    w: MAP.nodePad * 2 + columns * MAP.serviceW + (columns - 1) * MAP.guestGap,
    h: MAP.nodeHeader + servicesHeight(rows) + MAP.nodePad,
    guests: [],
    services: items,
  };
}

/**
 * Deterministic automatic layout: nodes first (in the Host view order), then the
 * "host not found", "host unavailable" and "not linked" containers. Containers flow left to
 * right and wrap in rows. The same input always gives the same output, and the order of
 * `containers`, `guests` and `services` is exactly the Host view order (it is the DOM and focus
 * order too).
 */
export function layoutMap(model: HostViewModel): MapLayout {
  const containers: MapContainer[] = model.nodes.map(layoutNode);
  if (model.notFound.length) containers.push(layoutLoose('notFound', model.notFound));
  if (model.unavailable.length) containers.push(layoutLoose('unavailable', model.unavailable));
  if (model.unlinked.length) containers.push(layoutLoose('unlinked', model.unlinked));
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const container of containers) {
    if (x > 0 && x + container.w > MAP.rowWidth) {
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
  return { width, height: containers.length ? y + rowHeight : 0, containers };
}

/** Zoom that makes the whole map fit a viewport, within the allowed range. */
export function fitZoom(layout: MapLayout, viewportWidth: number, viewportHeight: number) {
  if (!layout.width || !layout.height || viewportWidth <= 0 || viewportHeight <= 0)
    return ZOOM.default;
  return clampZoom(Math.min(viewportWidth / layout.width, viewportHeight / layout.height));
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
