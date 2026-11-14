import { Bell } from 'lucide-react';
import type { Service } from '@homora/shared';
import { Button } from '@/components/ui/button';
import { useAlertCount } from '@/hooks/use-alert-count';
import type { ServiceStatus } from '@/lib/services';
import { t } from '@/i18n';

type Props = {
  services: Service[];
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  onOpen: () => void;
};

/** The click goes to the Activity page. */
export function AlertsBell({ services, statuses, blockedIds, onOpen }: Props) {
  const count = useAlertCount(services, statuses, blockedIds);
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
