import type { Service } from '@homora/shared';
import { hostOf } from '@/lib/services';
import type { HostGuestGroup, HostViewModel } from '@/features/hosts/hosts';
import { guestSummary, isProblem, nodeSummary, type HealthOf } from '@/features/hosts/host-health';

export type MapFilter = 'all' | 'problems' | 'unlinked';

/** Lower case without accents, so "cafe" finds "Café". */
export const fold = (value: string) =>
  value.normalize('NFD').replaceAll(/\p{M}/gu, '').toLocaleLowerCase();

const serviceText = (service: Service) =>
  fold([service.name, hostOf(service.url), service.category].join(' '));
const guestText = (group: HostGuestGroup) =>
  fold([group.guest.name, String(group.guest.vmid), group.guest.node].join(' '));

export type MapView = {
  /** Keys of the guests drawn with only their header. */
  collapsed: Set<string>;
  /** Containers, guests and services drawn in muted tokens because they are out of focus. */
  dimmedNodes: Set<string>;
  dimmedContainers: Set<string>;
  dimmedGuests: Set<string>;
  dimmedServices: Set<number>;
  /** Services that match the search, or null when nothing was typed. */
  matches: Set<number> | null;
  counts: { all: number; problems: number; unlinked: number };
};

type Input = {
  model: HostViewModel;
  services: Service[];
  healthOf: HealthOf;
  filter: MapFilter;
  query: string;
  collapseHealthy: boolean;
  /** What the person chose by hand for a guest; it beats every automatic rule. */
  overrides: ReadonlyMap<string, boolean>;
};

/**
 * Turns the toolbar (filter, search, "collapse healthy") into what the map draws. Nothing is
 * hidden from the list: a guest is collapsed or muted, never removed, so the Host view stays the
 * complete equivalent and a search never loses a service.
 */
export function mapView({
  model,
  services,
  healthOf,
  filter,
  query,
  collapseHealthy,
  overrides,
}: Input): MapView {
  const needle = fold(query.trim());
  const searching = needle.length > 0;
  const matches = searching
    ? new Set(services.filter((service) => serviceText(service).includes(needle)).map((s) => s.id))
    : null;
  const view: MapView = {
    collapsed: new Set(),
    dimmedNodes: new Set(),
    dimmedContainers: new Set(),
    dimmedGuests: new Set(),
    dimmedServices: new Set(),
    matches,
    counts: {
      all: services.length,
      problems: services.filter((service) => isProblem(healthOf(service))).length,
      unlinked: model.unlinked.length + model.notFound.length,
    },
  };
  for (const node of model.nodes) {
    const summary = nodeSummary(node, healthOf);
    let nodeHasMatch = searching && fold(node.node.name).includes(needle);
    for (const group of node.guests) {
      const guest = guestSummary(group, healthOf);
      const hit =
        searching &&
        (guestText(group).includes(needle) ||
          group.services.some((service) => matches?.has(service.id)));
      nodeHasMatch ||= hit;
      const quiet =
        (filter === 'problems' && !guest.problem) || filter === 'unlinked' || (searching && !hit);
      if (quiet) view.dimmedGuests.add(group.key);
      // A search always shows what it found; otherwise the person's choice, then the rules.
      const automatic =
        (filter === 'problems' && !guest.problem) ||
        filter === 'unlinked' ||
        (collapseHealthy && !guest.problem);
      const collapse = hit ? false : (overrides.get(group.key) ?? automatic);
      if (collapse) view.collapsed.add(group.key);
      if (searching)
        for (const service of group.services)
          if (!matches?.has(service.id)) view.dimmedServices.add(service.id);
    }
    if (
      (filter === 'problems' && !summary.problem) ||
      filter === 'unlinked' ||
      (searching && !nodeHasMatch)
    )
      view.dimmedNodes.add(node.key);
  }
  const loose: [string, Service[]][] = [
    ['notFound', model.notFound],
    ['unavailable', model.unavailable],
    ['external', model.external],
    ['unlinked', model.unlinked],
  ];
  for (const [id, list] of loose) {
    if (list.length === 0) continue;
    const toLink = id === 'unlinked' || id === 'notFound';
    if (
      (filter === 'problems' && !list.some((service) => isProblem(healthOf(service)))) ||
      (filter === 'unlinked' && !toLink) ||
      (searching && !list.some((service) => matches?.has(service.id)))
    )
      view.dimmedContainers.add(id);
    for (const service of list) {
      if (searching && !matches?.has(service.id)) view.dimmedServices.add(service.id);
      else if (filter === 'problems' && !isProblem(healthOf(service)))
        view.dimmedServices.add(service.id);
    }
  }
  return view;
}

/** The same toolbar applied to services grouped by dashboard group: tiles only, no guests. */
export function groupTileView(
  services: Service[],
  healthOf: HealthOf,
  filter: MapFilter,
  query: string,
): { dimmed: Set<number>; matches: Set<number> | null; groups: Set<string> } {
  const needle = fold(query.trim());
  const matches = needle
    ? new Set(services.filter((service) => serviceText(service).includes(needle)).map((s) => s.id))
    : null;
  const dimmed = new Set<number>();
  for (const service of services) {
    const out =
      (matches && !matches.has(service.id)) ||
      (filter === 'problems' && !isProblem(healthOf(service))) ||
      (filter === 'unlinked' && (service.host || service.hostExternal));
    if (out) dimmed.add(service.id);
  }
  const groups = new Set<string>();
  for (const service of services) if (!dimmed.has(service.id)) groups.add(service.category);
  return { dimmed, matches, groups };
}
