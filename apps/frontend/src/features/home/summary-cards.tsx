import type { Maintenance, MonitorSettings, StatusOverview } from '@homora/shared';
import { CalendarClock, CircleCheck, CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homora/ui/card';
import { cn } from '@homora/ui/lib/utils';
import { STATUS_FILTERS, type StatusFilter } from '@/features/dashboard/status-filter-model';
import { ErrorBudget, pct } from '@/features/uptime/health-figures';
import type { ServiceStatus } from '@/lib/services';
import { formatDateTime, t } from '@/i18n';

/** A titled card of the summary; the title is the section's accessible name. */
export function SummaryCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col">
      <Card className="h-full gap-3">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <h2 className="text-base">{title}</h2>
            </CardTitle>
            {action}
          </div>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">{children}</CardContent>
      </Card>
    </section>
  );
}

/** "Nothing to do", said calmly; or that this cannot be told right now. */
export function NothingToDo({ certain }: { certain: boolean }) {
  const Icon = certain ? CircleCheck : CircleHelp;
  return (
    <p className="flex items-start gap-2.5 text-sm">
      <Icon
        aria-hidden="true"
        className={cn('mt-0.5 size-4 shrink-0', certain ? 'text-success' : 'text-warning')}
      />
      <span className="flex flex-col">
        <span className="font-medium">
          {t(certain ? 'homeview.attention.none' : 'homeview.attention.uncertain')}
        </span>
        {certain && (
          <span className="text-muted-foreground">{t('homeview.attention.noneHint')}</span>
        )}
      </span>
    </p>
  );
}

/** Services answering past their slow limit, one line each. */
export function SlowList({ lines }: { lines: string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
      {lines.map((line) => (
        <li key={line} className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warning" />
          {line}
        </li>
      ))}
    </ul>
  );
}

const FILTER_DOT: Record<Exclude<StatusFilter, 'all'>, string> = {
  down: 'bg-destructive',
  degraded: 'bg-warning',
  maintenance: 'bg-info',
  ok: 'bg-success',
  unmeasured: 'bg-muted-foreground',
};

const RING: Record<Exclude<StatusFilter, 'all'>, string> = {
  down: 'text-destructive',
  degraded: 'text-warning',
  maintenance: 'text-info',
  ok: 'text-success',
  unmeasured: 'text-muted-foreground',
};

/** The share of all services in one state; decoration beside the number that says it. */
function Ring({ share, className }: { share: number; className: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true" className="size-8 shrink-0 -rotate-90">
      <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-muted" />
      {share > 0 && (
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          strokeWidth="4"
          stroke="currentColor"
          pathLength="100"
          strokeDasharray={`${share * 100} 100`}
          className={className}
        />
      )}
    </svg>
  );
}

/** One button per state: how many are in it, and the way to see them. */
export function StateStrip({
  counts,
  onSelect,
}: {
  counts: Record<StatusFilter, number>;
  onSelect: (filter: StatusFilter) => void;
}) {
  return (
    <ul
      aria-label={t('homeview.states')}
      data-homora="state-strip"
      className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2 p-0"
    >
      {STATUS_FILTERS.filter((filter) => filter !== 'all').map((filter) => (
        <li key={filter} className="flex">
          <button
            type="button"
            onClick={() => onSelect(filter)}
            aria-label={t('homeview.states.show', {
              state: t(`filter.status.${filter}`),
              count: counts[filter],
            })}
            className="flex min-h-14 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Ring
              share={counts.all > 0 ? counts[filter] / counts.all : 0}
              className={RING[filter]}
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-lg leading-tight font-medium tabular-nums">
                {counts[filter]}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={cn('size-1.5 shrink-0 rounded-full', FILTER_DOT[filter])}
                />
                <span className="leading-tight">{t(`filter.status.${filter}`)}</span>
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AvailabilityCard({ sla }: { sla?: StatusOverview['sla'] }) {
  return (
    <SummaryCard
      title={t('homeview.availability')}
      description={
        sla ? t('homeview.availability.hint', { target: pct(sla.targetPct) }) : undefined
      }
    >
      {sla ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <ErrorBudget sla={sla} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('homeview.availability.unavailable')}</p>
      )}
    </SummaryCard>
  );
}

/** How many services the latency list shows. */
const LATENCY_ROWS = 6;

/** The latest latency of the slowest services, each against its own slow limit. */
export function LatencyCard({
  entries,
  statuses,
  settings,
  onSelect,
}: {
  entries: { id: number; name: string }[];
  statuses: Record<number, ServiceStatus>;
  settings?: Record<number, MonitorSettings>;
  onSelect: (id: number) => void;
}) {
  const rows = entries
    .flatMap((entry) => {
      const status = statuses[entry.id];
      return status?.status === 'available' && typeof status.latencyMs === 'number'
        ? [
            {
              ...entry,
              latency: Math.round(status.latencyMs),
              limit: settings?.[entry.id]?.degradedLatencyMs ?? null,
            },
          ]
        : [];
    })
    .sort((a, b) => b.latency - a.latency)
    .slice(0, LATENCY_ROWS);
  const scale = Math.max(1, ...rows.map((row) => Math.max(row.latency, row.limit ?? 0)));
  return (
    <SummaryCard
      title={t('homeview.latency')}
      description={rows.length > 0 ? t('homeview.latency.hint') : undefined}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('homeview.latency.none')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => {
            const slow = row.limit !== null && row.latency > row.limit;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onSelect(row.id)}
                  aria-label={
                    row.limit === null
                      ? t('homeview.latency.row', { name: row.name, latency: row.latency })
                      : t('homeview.latency.limit', {
                          name: row.name,
                          latency: row.latency,
                          limit: row.limit,
                        })
                  }
                  className="grid min-h-8 w-full grid-cols-[minmax(0,2fr)_minmax(0,3fr)_4.5rem] items-center gap-3 rounded-md px-1 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
                >
                  <span className="truncate">{row.name}</span>
                  <span className="relative h-2 rounded-full bg-muted">
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full',
                        slow ? 'bg-warning' : 'bg-success',
                      )}
                      style={{ width: `${Math.max(2, (row.latency / scale) * 100)}%` }}
                    />
                    {row.limit !== null && (
                      <span
                        className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-foreground/60"
                        style={{ left: `${(row.limit / scale) * 100}%` }}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-right font-mono text-xs tabular-nums',
                      slow && 'font-medium text-warning',
                    )}
                  >
                    {row.latency} ms
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SummaryCard>
  );
}

/** How many windows the summary lists before pointing at the Maintenance view. */
const WINDOWS_SHOWN = 3;

export function UpcomingMaintenance({
  windows,
  now,
  nameOf,
  onAll,
}: {
  windows: Maintenance[];
  now: number;
  nameOf: (serviceId: number) => string;
  onAll: () => void;
}) {
  const ahead = windows.filter((item) => item.endsAt > now).slice(0, WINDOWS_SHOWN);
  return (
    <SummaryCard
      title={t('homeview.maintenance')}
      action={
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 pointer-coarse:min-h-11"
          onClick={onAll}
        >
          {t('homeview.maintenance.all')}
        </Button>
      }
    >
      {ahead.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('homeview.maintenance.none')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ahead.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-info" />
              <span className="font-medium">{nameOf(item.serviceId)}</span>
              <Badge
                variant="outline"
                className={cn(
                  'shrink whitespace-normal',
                  item.startsAt <= now && 'border-info/50 bg-info/10 text-info',
                )}
              >
                {item.startsAt <= now
                  ? t('maint.active', { time: formatDateTime(item.endsAt) })
                  : t('maint.range', {
                      start: formatDateTime(item.startsAt),
                      end: formatDateTime(item.endsAt),
                    })}
              </Badge>
              {item.note && (
                <span className="min-w-0 break-words text-muted-foreground">{item.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SummaryCard>
  );
}
