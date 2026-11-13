import { useMemo } from 'react';
import type { Service } from '@homora/shared';
import { useHostInventory } from '@/hooks/use-host-inventory';
import { useServices } from '@/hooks/use-services';
import { impairedUpstream, isImpaired, type Dependency } from '@/lib/dependencies';
import { offlineNodes, serviceImpact } from '@/lib/hosts';
import { t } from '@/i18n';

type ServicesData = ReturnType<typeof useServices>;
type HostData = ReturnType<typeof useHostInventory>;

type Options = {
  data: ServicesData;
  hostData: HostData;
  dependencies: Dependency[];
  managing: boolean;
  hostView: boolean;
  paged: boolean;
  query: string;
  selected: string | null;
  organizing: boolean;
};

/** Derived service-screen data: page/filter membership, grouped cards, host impact, and summary. */
export function useServicePageModel({
  data,
  hostData,
  dependencies,
  managing,
  hostView,
  paged,
  query,
  selected,
  organizing,
}: Options) {
  const { services, statuses, blockedIds, sortedIn, pages, categories: allCategories } = data;
  const { activePageId, pageIdOf } = data;
  const impacts = useMemo(
    () =>
      new Map(
        services.map((service) => [
          service.id,
          serviceImpact(
            service,
            statuses[service.id]?.status,
            blockedIds.has(service.id),
            hostData.connections,
            hostData.inventories,
          ),
        ]),
      ),
    [services, statuses, blockedIds, hostData.connections, hostData.inventories],
  );
  const upstream = useMemo(
    () => impairedUpstream(services, dependencies, impacts),
    [services, dependencies, impacts],
  );
  const dependencyNotes = useMemo(() => {
    const notes: Record<number, string> = {};
    for (const [id, causes] of upstream) {
      if (isImpaired(impacts.get(id))) continue;
      const names = causes
        .map((cause) => services.find((service) => service.id === cause)?.name)
        .filter(Boolean)
        .join(', ');
      if (names) notes[id] = t('dependencies.mayBeAffected', { names });
    }
    return notes;
  }, [upstream, impacts, services]);
  const offline = useMemo(
    () => offlineNodes(services, hostData.connections, hostData.inventories),
    [services, hostData.connections, hostData.inventories],
  );
  const categories = useMemo(
    () =>
      paged && !hostView
        ? allCategories.filter((category) => pageIdOf(category) === activePageId)
        : allCategories,
    [paged, hostView, allCategories, pageIdOf, activePageId],
  );
  const pageName = (service: Service) =>
    pages.length > 1
      ? pages.find((page) => page.id === pageIdOf(service.category))?.name
      : undefined;
  const onPage = (service: Service) => !paged || hostView || categories.includes(service.category);
  const needle = managing ? query.trim().toLowerCase() : '';
  const matches = (service: Service) =>
    !needle ||
    service.name.toLowerCase().includes(needle) ||
    service.url.toLowerCase().includes(needle);
  const filteredIds = new Set(
    services
      .filter(
        (service) =>
          onPage(service) &&
          matches(service) &&
          (selected === null || service.category === selected),
      )
      .map((service) => service.id),
  );
  const isDown = (service: Service) =>
    statuses[service.id]?.status === 'unavailable' && !blockedIds.has(service.id);
  const groups = categories
    .map((category) => ({
      category,
      items: sortedIn(category)
        .filter((service) => filteredIds.has(service.id))
        // Unavailable services rise to top within the group, except in Organize mode (user sets order).
        .sort((a, b) => (organizing ? 0 : Number(isDown(b)) - Number(isDown(a)))),
    }))
    .filter((group) => group.items.length || (selected === null && !needle));

  const total = services.length;
  const online = services.filter((service) => statuses[service.id]?.status === 'available').length;
  const down = services.filter(
    (service) => statuses[service.id]?.status === 'unavailable' && !blockedIds.has(service.id),
  ).length;
  const blocked = services.filter(
    (service) => blockedIds.has(service.id) && statuses[service.id]?.status !== 'available',
  ).length;
  const unknown = total - online - down - blocked;

  return {
    allCategories,
    categories,
    pageName,
    onPage,
    isDown,
    groups,
    impacts,
    dependencyNotes,
    offline,
    summary: { total, online, down, blocked, unknown },
  };
}
