import type { Probe, Service } from '@homora/shared';
import { describeStatus } from '@/lib/status-text';
import type { ServiceStatus } from '@/lib/services';
import {
  matchesStatusFilter,
  statusBucket,
  STATUS_FILTERS,
  type StatusFilter,
} from '@/features/dashboard/status-filter-model';

type Input = {
  probes: Probe[] | null | undefined;
  statuses: Record<number, ServiceStatus>;
  monitorSettings: Record<number, Parameters<typeof statusBucket>[1]> | undefined;
  /** The status view only applies while browsing the plain Home. */
  measurementReason?: string | null;
  browsing: boolean;
  statusFilter: StatusFilter;
  statusCounts: Record<StatusFilter, number>;
};

/**
 * Probes are monitors without a card: they get their own Home section and join "Needs attention".
 * The status views apply to them too; groups, tags and pages do not.
 */
export function deriveHomeProbes({
  probes,
  statuses,
  monitorSettings,
  measurementReason,
  browsing,
  statusFilter,
  statusCounts,
}: Input) {
  const allProbes = (probes ?? []).map((probe) => {
    const view = describeStatus(statuses[probe.id], false, { checkType: probe.checkType });
    return {
      id: probe.id,
      name: probe.name,
      address: probe.address,
      checkType: probe.checkType,
      bucket: statusBucket(
        statuses[probe.id],
        monitorSettings?.[probe.id],
        false,
        measurementReason,
      ),
      state: view.state,
      label: view.label,
      meta: view.meta,
    };
  });
  const probeViews = allProbes.filter((probe) =>
    matchesStatusFilter(browsing ? statusFilter : 'all', probe.bucket),
  );
  const countsWithProbes = Object.fromEntries(
    STATUS_FILTERS.map((filter) => [
      filter,
      statusCounts[filter] +
        allProbes.filter((probe) => matchesStatusFilter(filter, probe.bucket)).length,
    ]),
  ) as typeof statusCounts;
  const downProbes = allProbes
    .filter((probe) => probe.state === 'unavailable')
    .map((probe) => ({ id: probe.id, name: probe.name }) as Service);
  const probeIds = new Set(downProbes.map((probe) => probe.id));
  const probeStatusItems = allProbes.map((probe) => ({ id: probe.id, name: probe.name }));
  return { allProbes, probeViews, countsWithProbes, downProbes, probeIds, probeStatusItems };
}
