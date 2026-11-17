import { Link } from 'react-router';
import { Copy, ExternalLink, Star } from 'lucide-react';
import type {
  Incident,
  MonitorSettings,
  Service,
  UptimeRange,
  UptimeSummary,
} from '@homora/shared';
import { Button } from '@homora/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@homora/ui/sheet';
import { StatusLight } from '@/components/status-light';
import { UptimeBars, UptimeDetails, UptimePercent } from '@/features/uptime/service-uptime';
import { copyAddress } from '@/lib/copy-address';
import { describeStatus } from '@/lib/status-text';
import type { ServiceStatus } from '@/lib/services';
import { hostOf } from '@/lib/services';
import { useIsMobile } from '@/hooks/use-mobile';
import { t } from '@/i18n';

type Props = {
  service: Service | null;
  status?: ServiceStatus;
  blocked: boolean;
  uptime?: UptimeSummary;
  monitor?: MonitorSettings;
  incident?: Incident;
  maintenanceUntil?: number | null;
  range: UptimeRange;
  onRangeChange: (range: UptimeRange) => void;
  /** Favorite toggle; absent when it cannot be saved here. */
  onTogglePinned?: (service: Service) => void;
  onClose: () => void;
};

/**
 * Details without leaving the Home: state, the period bar, latency, recent incidents. A side
 * panel on wide screens and a bottom sheet on phones; the full page is one link away.
 */
export function ServiceDrawer({
  service,
  status,
  blocked,
  uptime,
  monitor,
  incident,
  maintenanceUntil,
  range,
  onRangeChange,
  onTogglePinned,
  onClose,
}: Props) {
  const mobile = useIsMobile();
  const view = service
    ? describeStatus(status, blocked, {
        monitor,
        downSince: incident?.startedAt,
        checkType: service.checkType,
        maintenanceUntil,
      })
    : null;
  return (
    <Sheet open={service !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={mobile ? 'bottom' : 'right'}
        className={mobile ? 'max-h-[85dvh] overflow-y-auto rounded-t-xl' : 'sm:max-w-md'}
      >
        {service && view && (
          <>
            <SheetHeader>
              <SheetTitle>{service.name}</SheetTitle>
              <SheetDescription className="font-mono">{hostOf(service.url)}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="flex flex-col gap-1">
                <StatusLight state={view.state} blocked={view.blocked} label={view.label} />
                {view.note && <p className="text-sm text-muted-foreground">{view.note}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a
                    href={service.url}
                    target={service.openTarget === 'same-tab' ? undefined : '_blank'}
                    rel="noopener noreferrer"
                  >
                    <ExternalLink />
                    {t('drawer.open')}
                  </a>
                </Button>
                {onTogglePinned && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={Boolean(service.pinned)}
                    onClick={() => onTogglePinned(service)}
                  >
                    <Star className={service.pinned ? 'fill-current' : undefined} />
                    {service.pinned ? t('pinned.remove') : t('pinned.add')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyAddress(service.url)}
                >
                  <Copy />
                  {t('drawer.copy')}
                </Button>
              </div>
              {uptime ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{t('drawer.availability')}</span>
                    <UptimePercent summary={uptime} />
                  </div>
                  <UptimeBars summary={uptime} monitor={monitor} />
                  <UptimeDetails
                    id={`drawer-${service.id}`}
                    service={service}
                    summary={uptime}
                    range={range}
                    onRangeChange={onRangeChange}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('drawer.noUptime')}</p>
              )}
              <Link
                to={`/services/${service.id}`}
                className="text-sm text-primary hover:underline"
                onClick={onClose}
              >
                {t('drawer.fullPage')} →
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
