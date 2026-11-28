import type { Service } from '@homora/shared';
import type { SummaryConfig } from '@homora/widgets/summary';
import {
  matchesStatusFilter,
  statusBucket,
  STATUS_FILTERS,
  type StatusFilter,
} from '@/features/dashboard/status-filter-model';
import { deriveHealth, type Health, type HealthSources } from '@/features/home/health';
import type { useHomeArea } from '@/features/home/use-home-area';
import type { useServices } from '@/hooks/use-services';

type ServicesData = ReturnType<typeof useServices>;

export type ScopeSources = {
  data: ServicesData;
  sources: HealthSources;
  health: Health;
  area: ReturnType<typeof useHomeArea>;
};

/** The services and health one widget talks about. */
export type Scoped = { services: Service[]; health: Health; scoped: boolean };

/**
 * The services of the chosen groups and pages. A name that no longer exists matches nothing, so a
 * selection never silently widens.
 */
export function servicesInScope(data: ServicesData, { groups = [], pages = [] }: SummaryConfig) {
  const pageName = (service: Service) =>
    data.pages.find((page) => page.id === data.pageIdOf(service.category))?.name;
  return data.services.filter(
    (service) =>
      (groups.length === 0 || groups.includes(service.category)) &&
      (pages.length === 0 || pages.includes(pageName(service) ?? '')),
  );
}

/**
 * The reading of health narrowed to a selection, made the same way as the whole one. Probes belong
 * to no group or page, so a narrowed reading leaves them out.
 */
export function scopedHealth(
  { data, sources, health, area }: ScopeSources,
  config: SummaryConfig,
): Scoped {
  if (!config.groups?.length && !config.pages?.length)
    return { services: data.services, health, scoped: false };
  const services = servicesInScope(data, config);
  const { overview } = sources;
  const buckets = services.map((service) =>
    statusBucket(
      data.statuses[service.id],
      overview?.settings?.[service.id],
      data.blockedIds.has(service.id),
      overview?.measurement?.reason,
    ),
  );
  const statusCounts = Object.fromEntries(
    STATUS_FILTERS.map((filter) => [
      filter,
      buckets.filter((bucket) => matchesStatusFilter(filter, bucket)).length,
    ]),
  ) as Record<StatusFilter, number>;
  return {
    services,
    scoped: true,
    health: deriveHealth(
      { ...sources, probeList: { ...sources.probeList, probes: [] } },
      {
        data: { ...data, services },
        hostData: area.hostData,
        impacts: area.model.impacts,
        statusCounts,
        statusFilter: 'all',
        browsing: false,
      },
    ),
  };
}
