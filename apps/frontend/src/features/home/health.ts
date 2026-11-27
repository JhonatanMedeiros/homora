import { useState } from 'react';
import type { MonitorSettings, Service, UptimeRange } from '@homora/shared';
import { useAcknowledgements } from '@/hooks/use-acknowledgements';
import { useNow } from '@/hooks/use-now';
import { useProbeList } from '@/hooks/use-probes';
import { useStatusOverview } from '@/hooks/use-status-overview';
import type { useServices } from '@/hooks/use-services';
import { activeWindows, useMaintenance } from '@/features/uptime/use-maintenance';
import { useUptime } from '@/features/uptime/use-uptime';
import { summarizeStatus } from '@/features/uptime/status-summary';
import { deriveHomeProbes } from '@/features/dashboard/home-probes-model';
import type { StatusFilter } from '@/features/dashboard/status-filter-model';
import { hostLabel, type Impact } from '@/features/hosts/hosts';
import type { useHostInventory } from '@/features/hosts/use-host-inventory';
import { isQuiet } from '@/lib/acknowledgements';

type ServicesData = ReturnType<typeof useServices>;

/** Everything the server says about health, beyond the services and their statuses. */
export function useHealthSources(range: UptimeRange) {
  const uptime = useUptime(range);
  const probeList = useProbeList();
  const [overviewVersion, setOverviewVersion] = useState(0);
  const overview = useStatusOverview(overviewVersion);
  const maintenance = useMaintenance();
  const clock = useNow();
  const attention = useAcknowledgements();
  return {
    uptime,
    probeList,
    overview,
    /** Reloads the overview after alert settings change. */
    reloadOverview: () => setOverviewVersion((version) => version + 1),
    maintenance,
    clock,
    attention,
    inMaintenance: activeWindows(maintenance.windows, clock),
  };
}

export type HealthSources = ReturnType<typeof useHealthSources>;

type Input = {
  data: ServicesData;
  hostData: ReturnType<typeof useHostInventory>;
  /** Why each card is down, when its host or guest explains it. */
  impacts: Map<number, Impact>;
  statusCounts: Record<StatusFilter, number>;
  statusFilter: StatusFilter;
  /** Probes follow the status filter only while browsing the plain Services view. */
  browsing: boolean;
};

/**
 * The one reading of health shared by the Home, Services and Maintenance, so the header pill, the
 * sidebar counts and the summary can never disagree.
 */
export function deriveHealth(
  sources: HealthSources,
  { data, hostData, impacts, statusCounts, statusFilter, browsing }: Input,
) {
  const { services, statuses, blockedIds } = data;
  const { overview, attention, clock } = sources;
  const monitorSettings: Record<number, MonitorSettings> | undefined = overview?.settings;
  const isDown = (service: Service) =>
    statuses[service.id]?.status === 'unavailable' && !blockedIds.has(service.id);
  const probes = deriveHomeProbes({
    probes: sources.probeList.probes,
    statuses,
    monitorSettings,
    measurementReason: overview?.measurement?.reason,
    browsing,
    statusFilter,
    statusCounts,
  });
  const downNow = [...services.filter(isDown), ...probes.downProbes];
  const entries = [...services, ...probes.probeStatusItems];
  const summary = summarizeStatus({
    services: entries,
    statuses,
    blockedIds,
    overview,
    now: clock,
    probeIds: probes.probeIds,
    stale: data.statusError,
  });
  const causeOf = (service: Service | null | undefined) => {
    const link = service?.host;
    const kind = service ? impacts.get(service.id) : undefined;
    if (!link || (kind !== 'host-offline' && kind !== 'guest-stopped')) return;
    const sameHost = (item: Service) =>
      item.host?.connectionId === link.connectionId &&
      item.host.node === link.node &&
      (kind === 'host-offline' || item.host.vmid === link.vmid);
    const label = hostLabel(service, hostData.connections, hostData.inventories);
    return {
      kind,
      host: kind === 'guest-stopped' && label?.kind === 'found' ? label.guest.name : link.node,
      affected: services.filter((item) => sameHost(item) && impacts.get(item.id) === kind).length,
    };
  };
  const quietNow = (id: number) => isQuiet(attention.marks[id], overview?.open[id]?.id, clock);
  return { ...probes, isDown, downNow, entries, summary, causeOf, quietNow };
}

export type Health = ReturnType<typeof deriveHealth>;
