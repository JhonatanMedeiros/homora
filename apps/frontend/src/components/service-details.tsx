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
import { StatusLight } from '@/components/status-light';
import { UptimeBars, UptimeDetails, UptimePercent } from '@/features/uptime/service-uptime';
import { copyAddress } from '@/lib/copy-address';
import { describeStatus } from '@/lib/status-text';
import type { ServiceStatus } from '@/lib/services';
import { isLoopback } from '@/lib/services';
import { t } from '@/i18n';

export type ServiceDetailsProps = {
  service: Service;
  status?: ServiceStatus;
  blocked: boolean;
  uptime?: UptimeSummary;
  monitor?: MonitorSettings;
  incident?: Incident;
  maintenanceUntil?: number | null;
  /** The host or guest that likely explains the failure, with the other cards it affects. */
  cause?: { kind: 'host-offline' | 'guest-stopped'; host: string; affected: number };
  onShowMap?: () => void;
  /** Opens the card's permission, when that is all monitoring is missing. */
  onAllowMonitoring?: (service: Service) => void;
  range: UptimeRange;
  onRangeChange: (range: UptimeRange) => void;
  /** Favorite toggle; absent when it cannot be saved here. */
  onTogglePinned?: (service: Service) => void;
  /** Called when the link to the full page is followed. */
  onFullPage?: () => void;
};

/** A service at a glance: state, actions, likely cause, availability and the way to its page. */
export function ServiceDetails({
  service,
  status,
  blocked,
  uptime,
  monitor,
  incident,
  maintenanceUntil,
  cause,
  onShowMap,
  onAllowMonitoring,
  range,
  onRangeChange,
  onTogglePinned,
  onFullPage,
}: ServiceDetailsProps) {
  const measured = uptime?.buckets.filter((bucket) => (bucket.checks ?? 0) > 0).length ?? 0;
  const view = describeStatus(status, blocked, {
    monitor,
    downSince: incident?.startedAt,
    checkType: service.checkType,
    maintenanceUntil,
  });
  return (
    <>
      <div className="flex flex-col gap-1">
        <StatusLight state={view.state} blocked={view.blocked} label={view.label} />
        {view.note && <p className="text-sm text-muted-foreground">{view.note}</p>}
        {view.blocked && isLoopback(service.url) && (
          <p className="text-sm text-muted-foreground">{t('drawer.loopback')}</p>
        )}
        {view.blocked && !isLoopback(service.url) && onAllowMonitoring && (
          <Button
            type="button"
            variant="link"
            className="h-auto w-fit p-0"
            onClick={() => onAllowMonitoring(service)}
          >
            {t('drawer.allow')}
          </Button>
        )}
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
        <Button type="button" variant="outline" onClick={() => void copyAddress(service.url)}>
          <Copy />
          {t('drawer.copy')}
        </Button>
      </div>
      {cause && (
        <div className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <p>
            {t(`drawer.cause.${cause.kind}`, { host: cause.host })}
            {cause.affected > 1 && <> {t('drawer.cause.affected', { count: cause.affected })}</>}
          </p>
          {onShowMap && (
            <Button type="button" variant="link" className="h-auto w-fit p-0" onClick={onShowMap}>
              {t('drawer.cause.map')}
            </Button>
          )}
        </div>
      )}
      {uptime ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('drawer.availability')}</span>
            <UptimePercent summary={uptime} />
          </div>
          <UptimeBars summary={uptime} monitor={monitor} />
          {uptime.uptimePct === null ? (
            <p className="text-sm text-muted-foreground">{t('drawer.collecting')}</p>
          ) : (
            measured * 2 < uptime.buckets.length && (
              <p className="text-sm text-muted-foreground">
                {t('drawer.shortHistory', { measured, total: uptime.buckets.length })}
              </p>
            )
          )}
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
        className="text-sm text-accent-text hover:underline"
        onClick={onFullPage}
      >
        {t('drawer.fullPage')} →
      </Link>
    </>
  );
}
