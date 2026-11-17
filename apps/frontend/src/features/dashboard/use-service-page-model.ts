import { useMemo } from 'react';
import type { MonitorSettings, Service } from '@homora/shared';
import { useHostInventory } from '@/features/hosts/use-host-inventory';
import { useServices } from '@/hooks/use-services';
import { impairedUpstream, isImpaired, type Dependency } from '@/features/hosts/dependencies';
import { offlineNodes, serviceImpact } from '@/features/hosts/hosts';
import {
  matchesStatusFilter,
  statusBucket,
  STATUS_FILTERS,
  type StatusFilter,
} from '@/features/dashboard/status-filter-model';
import { t } from '@/i18n';

type ServicesData = ReturnType<typeof useServices>;
type HostData = ReturnType<typeof useHostInventory>;

type Options = {
  data: ServicesData;
  hostData: HostData;
  dependencies: Dependency[];
  hostView: boolean;
  paged: boolean;
  selected: string | null;
  organizing: boolean;
  /** Home filters: by state and by tag. Ignored while organizing or in a host view. */
  statusFilter: StatusFilter;
  tagFilter: string | null;
  tags: Record<number, string[]>;
  /** Alert settings per service (the degraded limit decides the "degraded" bucket). */
  monitorSettings?: Record<number, MonitorSettings>;
  measurementReason?: string | null;
};

/** Derived service-screen data: page/filter membership, grouped cards, host impact, and summary. */
export function useServicePageModel({
  data,
  hostData,
  dependencies,
  hostView,
  paged,
  selected,
  organizing,
  statusFilter,
  tagFilter,
  tags,
  monitorSettings,
  measurementReason,
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
  // Status and tag filters apply only while browsing the plain Home view.
  const filtering = !organizing && !hostView;
  const bucketOf = (service: Service) =>
    statusBucket(
      statuses[service.id],
      monitorSettings?.[service.id],
      blockedIds.has(service.id),
      measurementReason,
    );
  const activeStatusFilter = filtering ? statusFilter : 'all';
  const activeTag = filtering ? tagFilter : null;
  const filteredIds = new Set(
    services
      .filter(
        (service) =>
          onPage(service) &&
          (selected === null || service.category === selected) &&
          (activeTag === null || (tags[service.id] ?? []).includes(activeTag)) &&
          matchesStatusFilter(activeStatusFilter, bucketOf(service)),
      )
      .map((service) => service.id),
  );
  const statusCounts = Object.fromEntries(
    STATUS_FILTERS.map((filter) => [
      filter,
      services.filter(
        (service) => onPage(service) && matchesStatusFilter(filter, bucketOf(service)),
      ).length,
    ]),
  ) as Record<StatusFilter, number>;
  const allTags = [...new Set(Object.values(tags).flat())].sort();
  const problemRank = (bucket: ReturnType<typeof statusBucket>) =>
    bucket === 'down' ? 2 : bucket === 'degraded' ? 1 : 0;
  const isDown = (service: Service) =>
    statuses[service.id]?.status === 'unavailable' && !blockedIds.has(service.id);
  const groups = categories
    .map((category) => ({
      category,
      items: sortedIn(category)
        .filter((service) => filteredIds.has(service.id))
        // Problems rise to the top of the group (offline, then degraded), except in Organize mode,
        // where the user sets the order. The sort is stable, so the rest keeps its own order.
        .sort((a, b) => (organizing ? 0 : problemRank(bucketOf(b)) - problemRank(bucketOf(a)))),
    }))
    .filter(
      (group) =>
        group.items.length ||
        (selected === null && activeStatusFilter === 'all' && activeTag === null),
    );

  return {
    allCategories,
    categories,
    pageName,
    onPage,
    isDown,
    groups,
    statusCounts,
    allTags,
    activeStatusFilter,
    activeTag,
    impacts,
    dependencyNotes,
    offline,
  };
}
