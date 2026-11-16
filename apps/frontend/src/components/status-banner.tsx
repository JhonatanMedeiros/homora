import {
  CERT_WARNING_DAYS,
  type Maintenance,
  type StatusOverview,
  type UptimeRange,
  type UptimeSummary,
} from '@homora/shared';
import { ChevronDown, CircleCheck, TriangleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useNow } from '@/hooks/use-now';
import { Progress } from '@/components/ui/progress';
import { formatDateTime, formatNumber, formatShortDateTime, formatTime, t } from '@/i18n';
import type { ServiceStatus } from '@/lib/services';
import { formatDuration } from '@/features/uptime/uptime-view';
import { summarizeStatus, type WindowState } from '@/features/uptime/status-summary';
import { cn } from '@/lib/utils';

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
  /** Opens the details of a service; when set, the pulse shows one clickable window per service. */
  onOpenService?: (id: number) => void;
  /** Where to look when the monitor itself cannot measure. */
  onOpenConnections?: () => void;
  /**
   * `card` is the block on the Home; `popover` is the same content without the card, always
   * showing its numbers, for the status popover in the header.
   */
  variant?: 'card' | 'popover';
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
const pct = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });

function Stat({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-muted px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono text-lg leading-tight font-medium tabular-nums">{value}</dd>
      {/* The note repeats what the number says; it only earns its height on wide screens. */}
      <dd className="m-0 hidden text-xs text-muted-foreground lg:block">{note}</dd>
    </div>
  );
}

/** Soonest certificate expiry; says which one when it is close or already past. */
function CertStat({ certs }: { certs: { name: string; days: number }[] }) {
  const soonest = certs.reduce((a, b) => (b.days < a.days ? b : a));
  const warn = soonest.days <= CERT_WARNING_DAYS;
  return (
    <Stat
      label={t('banner.stat.certs')}
      value={
        <span className={cn(warn && (soonest.days < 0 ? 'text-destructive' : 'text-warning'))}>
          {soonest.days < 0 ? t('uptime.none') : t('duration.d', { n: soonest.days })}
        </span>
      }
      note={
        soonest.days < 0
          ? t('banner.certs.expired', { name: soonest.name })
          : warn
            ? t('banner.certs.soon', { name: soonest.name, days: soonest.days })
            : certs.length === 1
              ? t('banner.certs.ok.one')
              : t('banner.certs.ok.other', { count: certs.length })
      }
    />
  );
}

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
 * The first thing the Home says: is everything fine, and if not, what and for how long. Below it,
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
  onOpenService,
  onOpenConnections,
  variant = 'card',
}: Props) {
  const clock = useNow();
  const now = fixedNow ?? clock;
  // On a phone the numbers wait behind "Details": the cards below are what people came for.
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const embedded = variant === 'popover';
  // Embedded in the popover the numbers are always visible; the card hides them on phones.
  const shown = embedded || open;
  if (services.length === 0) return null;
  const { certs, windows, measurement, title, subtitle, tone } = summarizeStatus({
    services,
    statuses,
    blockedIds,
    overview,
    now,
  });

  const values = services
    .map((service) => uptime[service.id]?.uptimePct)
    .filter((value): value is number => typeof value === 'number');
  const average = values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
    : null;

  const delta = overview ? overview.incidents7d - overview.incidentsPrevious7d : 0;
  const incidentNote = !overview
    ? ''
    : overview.incidents7d === 0 && overview.incidentsPrevious7d === 0
      ? t('banner.incidents.none')
      : delta === 0
        ? t('banner.incidents.same')
        : delta < 0
          ? t('banner.incidents.fewer', { count: -delta })
          : t('banner.incidents.more', { count: delta });

  const upcoming = maintenance.find((item) => item.endsAt > now);
  const sla = overview?.sla;
  const budget = sla && sla.actualPct !== null ? 100 - sla.targetPct : null;
  const left =
    sla && sla.actualPct !== null && budget
      ? Math.max(0, Math.min(100, Math.round((1 - (100 - sla.actualPct) / budget) * 100)))
      : null;

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
            {subtitle && (
              <p
                className={cn('mt-0.5 text-sm text-muted-foreground', !shown && 'hidden sm:block')}
              >
                {subtitle}
              </p>
            )}
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('-my-1 -mr-2 shrink-0 sm:hidden', embedded && 'hidden')}
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((value) => !value)}
          >
            {t(open ? 'banner.hideDetails' : 'banner.details')}
            <ChevronDown
              aria-hidden="true"
              className={cn('transition-transform', open && 'rotate-180')}
            />
          </Button>
        </div>
        <dl
          id={detailsId}
          className={cn(
            'm-0 min-w-0 flex-[3_1_32rem] grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2',
            shown ? 'grid' : 'hidden sm:grid',
          )}
        >
          <Stat
            label={t('banner.stat.uptime', { range: t(`uptime.range.${range}`) })}
            value={average === null ? t('uptime.none') : `${pct(average)}%`}
            note={
              services.length === 1
                ? t('banner.stat.uptimeSub.one')
                : t('banner.stat.uptimeSub.other', { count: services.length })
            }
          />
          {overview && (
            <>
              <Stat
                label={t('banner.stat.incidents')}
                value={overview.incidents7d}
                note={incidentNote}
              />
              <Stat
                label={t('banner.stat.mttr')}
                value={
                  overview.mttrMs === null ? t('uptime.none') : formatDuration(overview.mttrMs)
                }
                note={
                  overview.mttrMs === null
                    ? t('banner.mttr.none')
                    : t('banner.mttr.longest', {
                        duration: formatDuration(overview.longestCleanMs),
                      })
                }
              />
            </>
          )}
          {certs.length > 0 && <CertStat certs={certs} />}
        </dl>
      </div>
      {onOpenService && windows.length > 1 && (
        <ul aria-label={t('banner.windows')} className="m-0 flex list-none flex-wrap gap-1 p-0">
          {windows.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpenService(item.id)}
                aria-label={`${item.name}: ${t(WINDOW_LABEL[item.state])}`}
                title={`${item.name}: ${t(WINDOW_LABEL[item.state])}`}
                className="grid size-4 place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:size-6"
              >
                <span className={cn('block size-3 rounded-sm', WINDOW_COLOR[item.state])} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(upcoming || sla) && (
        <div
          className={cn(
            'flex-col gap-3 border-t pt-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-8',
            shown ? 'flex' : 'hidden sm:flex',
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
              {sla.actualPct === null || left === null ? (
                <span className="text-muted-foreground">{t('banner.sla.none')}</span>
              ) : (
                <>
                  <Progress
                    value={left}
                    aria-label={t('banner.sla.budget', { pct: left })}
                    className="h-2 min-w-40 flex-1"
                  />
                  <span className="font-mono tabular-nums">
                    {t('banner.sla.reached', { pct: pct(sla.actualPct) })}
                  </span>
                  <span className="text-muted-foreground">
                    {left > 0 ? t('banner.sla.budget', { pct: left }) : t('banner.sla.exhausted')}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
  return embedded ? (
    <section aria-label={t('banner.label')} className="flex flex-col gap-3">
      {inner}
    </section>
  ) : (
    <Card aria-label={t('banner.label')} role="region" className="gap-3 py-3 sm:py-4">
      <CardContent className="flex flex-col gap-3 px-4 sm:px-5">{inner}</CardContent>
    </Card>
  );
}
