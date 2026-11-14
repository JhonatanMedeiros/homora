import { Bell } from 'lucide-react';
import type { Service } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { useAcknowledgements } from '@/hooks/use-acknowledgements';
import { useStatusOverview } from '@/hooks/use-status-overview';
import { useNow } from '@/hooks/use-now';
import { isQuiet } from '@/lib/acknowledgements';
import type { ServiceStatus } from '@/lib/services';
import { t } from '@/i18n';

type Props = {
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  onOpen: () => void;
};

/**
 * Offline services that nobody has acknowledged or muted. It counts only what Homora already shows
 * as down, so it never says more than the Home does; the click goes to the Activity page.
 */
export function AlertsBell({ services, statuses, blockedIds, onOpen }: Props) {
  const overview = useStatusOverview();
  const { marks } = useAcknowledgements();
  const now = useNow();
  const count = services.filter(
    (service) =>
      statuses[service.id]?.status === 'unavailable' &&
      !blockedIds.has(service.id) &&
      statuses[service.id]?.reason !== 'maintenance' &&
      !isQuiet(marks[service.id], overview?.open[service.id]?.id, now),
  ).length;
  const label = count > 0 ? t('bell.count', { count }) : t('bell.none');
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className="relative px-2.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center font-mono text-[0.625rem] leading-4 text-white"
        >
          {count}
        </span>
      )}
    </Button>
  );
}
