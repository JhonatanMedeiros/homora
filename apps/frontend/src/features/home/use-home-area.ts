import { useMemo } from 'react';
import type { UptimeRange } from '@homora/shared';
import type { BrowseState } from '@/features/dashboard/use-browse-state';
import { useServicePageModel } from '@/features/dashboard/use-service-page-model';
import { useHomeAttentionActions } from '@/features/dashboard/use-home-attention-actions';
import { deriveHealth, useHealthSources } from '@/features/home/health';
import { useDependencies } from '@/features/hosts/use-dependencies';
import { useHostInventory } from '@/features/hosts/use-host-inventory';
import type { useServices } from '@/hooks/use-services';
import { useTags } from '@/hooks/use-tags';

type ServicesData = ReturnType<typeof useServices>;

/** The data of the Home views that have no cards of their own: the Summary and Maintenance. */
export function useHomeArea(data: ServicesData, browse: BrowseState, range: UptimeRange) {
  const sources = useHealthSources(range);
  const deps = useDependencies();
  const linked = useMemo(
    () => [
      ...new Set(
        data.services.flatMap((service) => (service.host ? [service.host.connectionId] : [])),
      ),
    ],
    [data.services],
  );
  const hostData = useHostInventory(false, linked);
  const { tags } = useTags();
  const model = useServicePageModel({
    data,
    hostData,
    dependencies: deps.dependencies,
    hostView: false,
    paged: data.pages.length > 1,
    selected: null,
    organizing: false,
    statusFilter: 'all',
    tagFilter: null,
    tags,
    monitorSettings: sources.overview?.settings,
    measurementReason: sources.overview?.measurement?.reason,
  });
  const health = deriveHealth(sources, {
    data,
    hostData,
    impacts: model.impacts,
    statusCounts: model.statusCounts,
    statusFilter: browse.statusFilter,
    browsing: true,
  });
  const actions = useHomeAttentionActions({
    data,
    attention: sources.attention,
    overview: sources.overview,
  });
  return {
    sources,
    hostData,
    model,
    health,
    actions,
    categories: model.categories.filter((name): name is string => typeof name === 'string'),
  };
}
