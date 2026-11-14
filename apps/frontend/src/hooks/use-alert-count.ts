import type { Service } from '@homora/shared';
import { useAcknowledgements } from '@/hooks/use-acknowledgements';
import { useStatusOverview } from '@/hooks/use-status-overview';
import { useNow } from '@/hooks/use-now';
import { isQuiet } from '@/lib/acknowledgements';
import type { ServiceStatus } from '@/lib/services';

/**
 * Offline services that nobody has acknowledged or muted. It counts only what Homora already shows
 * as down, so it never says more than the Home does.
 */
export function useAlertCount(
  services: Service[],
  statuses: Record<number, ServiceStatus>,
  blockedIds: Set<number>,
): number {
  const overview = useStatusOverview();
  const { marks } = useAcknowledgements();
  const now = useNow();
  return services.filter(
    (service) =>
      statuses[service.id]?.status === 'unavailable' &&
      !blockedIds.has(service.id) &&
      statuses[service.id]?.reason !== 'maintenance' &&
      !isQuiet(marks[service.id], overview?.open[service.id]?.id, now),
  ).length;
}
