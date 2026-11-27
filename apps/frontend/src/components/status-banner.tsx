import {
  type Maintenance,
  type StatusOverview,
  type UptimeRange,
  type UptimeSummary,
} from '@homora/shared';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@homora/ui/button';
import { Badge } from '@homora/ui/badge';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, formatShortDateTime, formatTime, t } from '@/i18n';
import { averageUptime, ErrorBudget, HealthFigures, pct } from '@/features/uptime/health-figures';
import type { ServiceStatus } from '@/lib/services';
import { summarizeStatus, type WindowState } from '@/features/uptime/status-summary';
import { cn } from '@homora/ui/lib/utils';

type Props = {
  services: { id: number; name: string }[];
  statuses: Record<number, ServiceStatus>;
  /** Services the network policy keeps from being checked; they are not "down". */
  blockedIds: Set<number>;
  overview?: StatusOverview;
  /** Maintenance windows open now or still ahead, soonest first. */
  maintenance?: Maintenance[];
  /** Uptime of every service over `range`. */
  uptime: Record<number, UptimeSummary>;
  range: UptimeRange;
  now?: number;
  probeIds?: ReadonlySet<number>;
  stale?: boolean;
  /** What needs doing now; it sits right under the headline, above the figures. */
  attention?: ReactNode;
  /** Opens the details of a service; when set, the pulse shows one clickable window per service. */
  onOpenService?: (id: number) => void;
  /** Where to look when the monitor itself cannot measure. */
  onOpenConnections?: () => void;
};

const WINDOW_COLOR: Record<WindowState, string> = {
  down: 'bg-destructive',
  degraded: 'bg-warning',
  ok: 'bg-success',
  maintenance: 'bg-info',
  unknown: 'bg-muted-foreground/40',
};
const WINDOW_LABEL = {
  down: 'status.unavailable',
  degraded: 'status.degraded',
  ok: 'status.available',
  maintenance: 'status.maintenance',
  unknown: 'status.unknown',
} as const satisfies Record<WindowState, string>;
const WINDOW_ORDER: WindowState[] = ['down', 'degraded', 'unknown', 'maintenance', 'ok'];
/** Past this, a state shows how many more there are instead of one window each. */
const MAX_WINDOWS = 40;
/** "today 23:00 – 23:30" style range of a window, with the date only when it is not today. */
function whenText(item: Maintenance) {
  const today = new Date().toDateString() === new Date(item.startsAt).toDateString();
  const sameDay = new Date(item.startsAt).toDateString() === new Date(item.endsAt).toDateString();
  return t('maint.range', {
    start: today ? formatTime(item.startsAt) : formatShortDateTime(item.startsAt),
    end: sameDay ? formatTime(item.endsAt) : formatDateTime(item.endsAt),
  });
}

/**
 * What the header pill opens: is everything fine, and if not, what and for how long. Below it,
 * the week in numbers (incidents, recovery time) and the availability target for the month.
 */
export function StatusBanner({
  services,
  statuses,
  blockedIds,
  overview,
  maintenance = [],
  uptime,
  range,
  now: fixedNow,
  probeIds,
  stale,
  attention,
  onOpenService,
  onOpenConnections,
}: Props) {
  const clock = useNow();
  const now = fixedNow ?? clock;
  if (services.length === 0) return null;
  const { certs, windows, measurement, title, subtitle, breakdown, tone, blocked } =
    summarizeStatus({
      services,
      statuses,
      blockedIds,
      overview,
      now,
      probeIds,
      stale,
    });

  const upcoming = maintenance.find((item) => item.endsAt > now);
  const sla = overview?.sla;
  const inner = (
    <>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
        <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3 sm:min-w-64">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-lg',
              tone === 'down' && 'bg-destructive/15 text-destructive',
              tone === 'warn' && 'bg-warning/15 text-warning',
              tone === 'ok' && 'bg-success/15 text-success',
            )}
          >
            {tone === 'ok' ? (
              <CircleCheck className="size-5" />
            ) : (
              <TriangleAlert className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              role="status"
              className="text-base leading-tight font-semibold tracking-tight sm:text-lg"
            >
              {title}
            </p>
            {breakdown && <p className="mt-0.5 text-sm font-medium">{breakdown}</p>}
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            {measurement && onOpenConnections && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="mt-1 h-auto p-0"
                onClick={onOpenConnections}
              >
                {t('banner.measurement.action')}
              </Button>
            )}
          </div>
        </div>
        {attention && <div className="w-full">{attention}</div>}
        <HealthFigures
          average={averageUptime(services, uptime)}
          monitored={services.length - blocked}
          range={range}
          overview={overview}
          certs={certs}
          className="flex-[3_1_32rem]"
        />
      </div>
      {onOpenService && windows.length > 1 && (
        <ul aria-label={t('banner.windows')} className="m-0 flex list-none flex-col gap-2 p-0">
          {WINDOW_ORDER.map((state) => {
            const group = windows.filter((item) => item.state === state);
            if (group.length === 0) return null;
            return (
              <li key={state} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {t(WINDOW_LABEL[state])} · {group.length}
                </span>
                <span className="flex flex-wrap gap-1">
                  {group.slice(0, MAX_WINDOWS).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onOpenService(item.id)}
                      aria-label={`${item.name}: ${t(WINDOW_LABEL[item.state])}`}
                      title={`${item.name}: ${t(WINDOW_LABEL[item.state])}`}
                      className="grid size-6 place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className={cn('block size-3 rounded-sm', WINDOW_COLOR[item.state])} />
                    </button>
                  ))}
                  {group.length > MAX_WINDOWS && (
                    <span className="text-xs text-muted-foreground">
                      {t('banner.more', { count: group.length - MAX_WINDOWS })}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {(upcoming || sla) && (
        <div
          className={cn(
            'flex-col gap-3 border-t pt-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-8',
            'flex',
          )}
        >
          {upcoming && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">
                {t(upcoming.startsAt <= now ? 'banner.maintenance.now' : 'banner.maintenance.next')}
              </span>
              <Badge variant="outline" className="border-info/50 bg-info/10 text-info">
                {whenText(upcoming)}
              </Badge>
              <span>{services.find((item) => item.id === upcoming.serviceId)?.name}</span>
              {upcoming.note && <span className="text-muted-foreground">{upcoming.note}</span>}
            </div>
          )}
          {sla && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm lg:min-w-[26rem] lg:flex-1">
              <span className="text-muted-foreground">
                {t('banner.sla.title', { target: pct(sla.targetPct) })}
              </span>
              <ErrorBudget sla={sla} />
            </div>
          )}
        </div>
      )}
    </>
  );
  return (
    <section aria-label={t('banner.label')} className="flex flex-col gap-3">
      {inner}
    </section>
  );
}
