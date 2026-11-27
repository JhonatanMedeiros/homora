import type { Service, UptimeRange } from '@homora/shared';
import type { ServiceDetailsProps } from '@/components/service-details';
import type { Health, HealthSources } from '@/features/home/health';
import type { useServices } from '@/hooks/use-services';

type Input = {
  data: ReturnType<typeof useServices>;
  sources: HealthSources;
  health: Health;
  range: UptimeRange;
  onRangeChange: (range: UptimeRange) => void;
  onTogglePinned: (service: Service) => void;
  onShowMap: () => void;
  onAllowMonitoring: (service: Service) => void;
};

/** What the drawer and the panel show about one service, gathered from the same sources. */
export function detailsFor(
  service: Service,
  {
    data,
    sources,
    health,
    range,
    onRangeChange,
    onTogglePinned,
    onShowMap,
    onAllowMonitoring,
  }: Input,
): Omit<ServiceDetailsProps, 'service' | 'onFullPage'> & { service: Service } {
  return {
    service,
    status: data.statuses[service.id],
    blocked: data.blockedIds.has(service.id),
    uptime: sources.uptime[service.id],
    monitor: sources.overview?.settings[service.id],
    incident: sources.overview?.open[service.id],
    maintenanceUntil: sources.inMaintenance[service.id]?.endsAt,
    cause: health.causeOf(service),
    onShowMap,
    onAllowMonitoring,
    range,
    onRangeChange,
    onTogglePinned,
  };
}

/**
 * What the panel shows before anything is chosen: a problem nobody acknowledged, else any problem,
 * else a favorite, else the first.
 */
export function defaultSelection(
  services: Service[],
  isDown: (service: Service) => boolean,
  isQuiet: (id: number) => boolean,
) {
  return (
    services.find((service) => isDown(service) && !isQuiet(service.id)) ??
    services.find(isDown) ??
    services.find((service) => service.pinned) ??
    services[0] ??
    null
  );
}
