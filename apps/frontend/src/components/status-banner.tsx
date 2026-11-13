import {
  isDegraded,
  type StatusOverview,
  type UptimeRange,
  type UptimeSummary,
} from '@homora/shared';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useNow } from '@/hooks/use-now';
import { Progress } from '@/components/ui/progress';
import { formatNumber, t } from '@/i18n';
import type { ServiceStatus } from '@/lib/services';
import { formatDuration } from '@/lib/uptime-view';
import { cn } from '@/lib/utils';

type Props = {
  services: { id: number; name: string }[];
  statuses: Record<number, ServiceStatus>;
  /** Services the network policy keeps from being checked; they are not "down". */
  blockedIds: Set<number>;
  overview?: StatusOverview;
  /** Uptime of every service over `range`. */
  uptime: Record<number, UptimeSummary>;
  range: UptimeRange;
  now?: number;
};

const MAX_NAMED = 3;
const pct = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });

function Stat({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-md bg-muted px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono text-xl font-medium tabular-nums">{value}</dd>
      <dd className="m-0 text-xs text-muted-foreground">{note}</dd>
    </div>
  );
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
  uptime,
  range,
  now: fixedNow,
}: Props) {
  const clock = useNow();
  const now = fixedNow ?? clock;
  if (services.length === 0) return null;
  const down: string[] = [];
  const slow: string[] = [];
  let unknown = 0;
  let blocked = 0;
  for (const service of services) {
    const status = statuses[service.id];
    const isBlocked = blockedIds.has(service.id) && status?.status !== 'available';
    if (isBlocked) blocked++;
    else if (status?.status === 'unavailable') {
      const since = overview?.open[service.id]?.startedAt;
      down.push(
        typeof since === 'number'
          ? t('banner.down', { name: service.name, duration: formatDuration(now - since) })
          : t('banner.downNow', { name: service.name }),
      );
    } else if (status?.status === 'available') {
      if (isDegraded(overview?.settings[service.id], status.status, status.latencyMs))
        slow.push(
          t('banner.degraded', {
            name: service.name,
            latency: Math.round(status.latencyMs ?? 0),
          }),
        );
    } else unknown++;
  }
  const problems = down.length + slow.length;
  const title =
    problems > 0
      ? problems === 1
        ? t('banner.problem.one')
        : t('banner.problem.other', { count: problems })
      : unknown > 0
        ? unknown === 1
          ? t('banner.unknown.one')
          : t('banner.unknown.other', { count: unknown })
        : blocked > 0
          ? t('banner.allMonitoredUp')
          : t('banner.allUp');
  const named = [...down, ...slow];
  const subtitle = [
    ...named.slice(0, MAX_NAMED),
    ...(named.length > MAX_NAMED ? [t('banner.more', { count: named.length - MAX_NAMED })] : []),
    ...(blocked > 0
      ? [blocked === 1 ? t('banner.blocked.one') : t('banner.blocked.other', { count: blocked })]
      : []),
  ].join(' · ');
  const tone =
    down.length > 0 ? 'down' : problems > 0 || unknown > 0 || blocked > 0 ? 'warn' : 'ok';

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

  const sla = overview?.sla;
  const budget = sla && sla.actualPct !== null ? 100 - sla.targetPct : null;
  const left =
    sla && sla.actualPct !== null && budget
      ? Math.max(0, Math.min(100, Math.round((1 - (100 - sla.actualPct) / budget) * 100)))
      : null;

  return (
    <Card aria-label={t('banner.label')} role="region" className="gap-5 py-5">
      <CardContent className="flex flex-col gap-5 px-5">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="flex min-w-64 flex-[1_1_22rem] items-start gap-3.5">
            <span
              aria-hidden="true"
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-lg',
                tone === 'down' && 'bg-destructive/15 text-destructive',
                tone === 'warn' && 'bg-warning/15 text-warning',
                tone === 'ok' && 'bg-success/15 text-success',
              )}
            >
              {tone === 'ok' ? (
                <CircleCheck className="size-6" />
              ) : (
                <TriangleAlert className="size-6" />
              )}
            </span>
            <div className="min-w-0">
              <p role="status" className="text-2xl leading-tight font-semibold tracking-tight">
                {title}
              </p>
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <dl className="m-0 grid min-w-0 flex-[2_1_28rem] grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3">
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
          </dl>
        </div>
        {sla && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-4 text-sm">
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
      </CardContent>
    </Card>
  );
}
