import { useState, type ReactNode } from 'react';
import {
  isDegraded,
  UPTIME_RANGES,
  type Incident,
  type LatencySeries,
  type Service,
  type ServiceInsights,
  type UptimeRange,
} from '@homora/shared';
import { ArrowLeft } from 'lucide-react';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { LoadingRegion } from '@/components/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useNow } from '@/hooks/use-now';
import { useStatusOverview } from '@/hooks/use-status-overview';
import { useServiceDetail } from '@/hooks/use-service-detail';
import { formatNumber, formatShortDateTime, formatTime, t } from '@/i18n';
import {
  CHART,
  deltaPoints,
  heatDays,
  heatUptime,
  latencyGeometry,
  longestClean,
  reasonShares,
  type HeatLevel,
} from '@/lib/detail-view';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { describeStatus } from '@/lib/status-text';
import { deltaText, formatDuration, reasonText } from '@/lib/uptime-view';
import { cn } from '@/lib/utils';

type Props = {
  id: number;
  services: Service[];
  loaded: boolean;
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  navigate: (path: string) => void;
};

const DAY = 86_400_000;
const pct = (value: number) =>
  formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ms = (value: number | null) =>
  value === null ? t('uptime.none') : formatNumber(Math.round(value));
const shortDate = (value: number) =>
  new Intl.DateTimeFormat(undefined, { day: '2-digit', month: '2-digit' }).format(new Date(value));
const INITIAL_INCIDENTS = 8;

const HEAT_CLASS: Record<HeatLevel, string> = {
  none: 'bg-muted',
  full: 'bg-success',
  high: 'bg-success/55',
  warn: 'bg-warning',
  down: 'bg-destructive',
};

function Panel({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn('flex flex-col gap-3.5 rounded-xl border bg-card p-5', className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  tone?: 'up' | 'down';
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'm-0 font-mono text-2xl font-medium tabular-nums',
          tone === 'down' && 'text-destructive',
        )}
      >
        {value}
      </dd>
      <dd
        className={cn(
          'm-0 font-mono text-xs text-muted-foreground',
          tone === 'down' && 'text-destructive',
          tone === 'up' && 'text-success',
        )}
      >
        {note}
      </dd>
    </div>
  );
}

function deltaNote(delta: number | null, context: string) {
  const text = deltaText(delta);
  if (!text) return { text: null, tone: undefined };
  return {
    text: `${text.text} ${context}`,
    tone: text.tone === 'same' ? undefined : text.tone,
  };
}

function LatencyChart({
  series,
  incidents,
  limit,
  now,
  range,
}: {
  series: LatencySeries;
  incidents: Incident[];
  limit: number | null;
  now: number;
  range: UptimeRange;
}) {
  const geometry = latencyGeometry(series, incidents, limit, now);
  const { width, height, left } = CHART;
  const withDate = range !== '24h';
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full min-w-[640px]"
        role="img"
        aria-label={t('detail.latency.chart', { range: t(`uptime.range.${range}`) })}
      >
        <g className="stroke-border" strokeWidth="1">
          {geometry.ticks.map((tick) => (
            <line key={tick.ms} x1={left} x2={width} y1={tick.y} y2={tick.y} />
          ))}
        </g>
        <g className="fill-muted-foreground font-mono text-[11px]">
          {geometry.ticks.map((tick) => (
            <text key={tick.ms} x="0" y={tick.y + 4}>
              {tick.ms === 0 ? `0 ms` : formatNumber(Math.round(tick.ms))}
            </text>
          ))}
          {geometry.axis.map((tick, index) => (
            <text
              key={tick.x}
              x={tick.x}
              y={height - 8}
              textAnchor={
                index === 0 ? 'start' : index === geometry.axis.length - 1 ? 'end' : 'middle'
              }
            >
              {withDate ? shortDate(tick.at) : formatTime(tick.at)}
            </text>
          ))}
        </g>
        {geometry.incidents.map((item) => (
          <rect
            key={item.x}
            x={item.x}
            y={CHART.top}
            width={item.width}
            height={CHART.bottom - CHART.top}
            className="fill-destructive"
            opacity=".18"
          />
        ))}
        {geometry.thresholdY !== null && (
          <line
            x1={left}
            x2={width}
            y1={geometry.thresholdY}
            y2={geometry.thresholdY}
            className="stroke-warning"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
        )}
        {geometry.p95.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            className="stroke-info"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        ))}
        {geometry.p50.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            className="stroke-primary"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
}

function HeatMap({ insights, now }: { insights: ServiceInsights; now: number }) {
  const days = heatDays(insights.heat, now);
  return (
    <>
      <div
        role="group"
        aria-label={t('detail.heat.grid')}
        className="grid auto-cols-[14px] grid-flow-col grid-rows-[repeat(7,14px)] gap-1 overflow-x-auto px-1 pt-8 pb-1"
      >
        {days.map((day) => {
          const label = t('detail.heat.day', {
            date: new Intl.DateTimeFormat(undefined, {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
            }).format(day.date),
            uptime: day.pct === null ? t('detail.heat.noData') : `${pct(day.pct)}%`,
          });
          return (
            <span
              key={day.date.getTime()}
              tabIndex={0}
              role="img"
              aria-label={label}
              className={cn(
                'group/cell relative rounded-[3px] outline-offset-1 hover:outline-2 hover:outline-foreground focus-visible:outline-2 focus-visible:outline-ring',
                HEAT_CLASS[day.level],
              )}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-10 hidden -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover/cell:block group-focus-visible/cell:block"
              >
                {label}
              </span>
            </span>
          );
        })}
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">{t('detail.heat.hint')}</p>
    </>
  );
}

function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
      {children}
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return (
    <i
      aria-hidden="true"
      className={cn('mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle', className)}
    />
  );
}

function Skeletons() {
  return (
    <LoadingRegion label={t('common.loading')} className="flex flex-col gap-5">
      <Skeleton className="h-14 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-72 w-full" />
    </LoadingRegion>
  );
}

/** One service in depth: the numbers, latency over time, 90 days of availability, why it failed and its incidents. */
export function ServiceDetailPage({ id, services, loaded, statuses, blockedIds, navigate }: Props) {
  const overview = useStatusOverview();
  const service = services.find((item) => item.id === id);
  const [range, setRange] = useState<UptimeRange>('24h');
  const [allIncidents, setAllIncidents] = useState(false);
  const now = useNow();
  const detail = useServiceDetail(id, range);
  if (!loaded) return <Skeletons />;
  if (!service)
    return (
      <section className="flex flex-col items-start gap-4">
        <h1 className="text-3xl">{t('detail.notFound')}</h1>
        <Button onClick={() => navigate('/')}>{t('route.home')}</Button>
      </section>
    );

  const monitor = overview?.settings[id];
  const incident = overview?.open[id];
  const status = statuses[id];
  const view = describeStatus(status, blockedIds.has(id), {
    monitor,
    downSince: incident?.startedAt ?? null,
    now,
  });
  const incidents = detail.incidents;
  const recentIncidents = incidents?.filter((item) => item.startedAt >= now - 30 * DAY) ?? [];
  const recovered = recentIncidents.filter((item) => item.endedAt !== null);
  const mttr = recovered.length
    ? recovered.reduce((sum, item) => sum + ((item.endedAt ?? 0) - item.startedAt), 0) /
      recovered.length
    : null;
  const heat = detail.insights?.heat ?? [];
  const firstData = heat.find((row) => row.up + row.down + row.unknown > 0)?.hour ?? now - 30 * DAY;
  const clean = incidents
    ? longestClean(incidents, Math.max(firstData, now - 90 * DAY), now)
    : null;
  const target = overview?.sla.targetPct;
  const kpis: { range: '24h' | '7d' | '30d'; context: string }[] = [
    { range: '24h', context: t('detail.delta.day') },
    { range: '7d', context: t('detail.delta.week') },
    { range: '30d', context: t('detail.delta.month') },
  ];
  const uptime90 = detail.insights ? heatUptime(heat) : null;
  const shown = allIncidents ? incidents : incidents?.slice(0, INITIAL_INCIDENTS);
  const shares = detail.insights ? reasonShares(detail.insights.reasons) : [];
  const state = view.state;
  const latencySeries = detail.latency;
  const hasLatency = latencySeries?.points.some((point) => point.checks > 0) ?? false;

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label={t('detail.breadcrumb')}
        className="flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-muted-foreground"
      >
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate('/');
          }}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          {t('detail.back')}
        </a>
        <span aria-hidden="true">/</span>
        <span>{service.category}</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{service.name}</span>
      </nav>

      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="grid size-13 shrink-0 place-items-center rounded-xl bg-muted text-xl font-semibold text-primary [&_img]:size-7 [&_svg]:size-6">
          <ServiceIcon icon={service.icon} name={service.name} />
        </span>
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-3xl leading-tight font-semibold tracking-tight">
            <span className="min-w-0 break-words">{service.name}</span>
            <Badge variant="outline" className="font-mono text-[0.65rem] uppercase">
              {service.checkType ?? 'http'}
            </Badge>
          </h1>
          <p className="font-mono text-sm break-all text-muted-foreground">
            {t('detail.meta', { host: hostOf(service.url), seconds: service.checkInterval ?? 60 })}
            {monitor && monitor.failureThreshold > 1 && (
              <> · {t('detail.meta.failures', { count: monitor.failureThreshold })}</>
            )}
          </p>
        </div>
        <StatusLight state={state} blocked={view.blocked} label={view.label} />
      </header>

      {incident && (
        <section
          aria-label={t('detail.live.title')}
          className="flex flex-wrap items-center gap-x-6 gap-y-1.5 rounded-xl border border-destructive/50 bg-destructive/14 px-4 py-3.5"
        >
          <b className="text-destructive">{t('detail.live.title')}</b>
          <span>
            {t('detail.live.since', {
              time: formatTime(incident.startedAt),
              duration: formatDuration(now - incident.startedAt),
            })}
          </span>
          <span className="font-mono">{reasonText(incident.reason, incident.httpStatus)}</span>
          <span className="text-muted-foreground">
            {t('detail.live.checks', { count: incident.failedChecks })}
          </span>
        </section>
      )}

      <dl
        aria-label={t('detail.kpi.label')}
        className="m-0 grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3"
      >
        {kpis.map(({ range: key, context }) => {
          const summary = detail.uptime[key];
          const value = summary?.uptimePct ?? null;
          const note = deltaNote(deltaPoints(value, summary?.previousUptimePct), context);
          return (
            <Kpi
              key={key}
              label={t('detail.kpi.uptime', { range: t(`uptime.range.${key}`) })}
              value={summary ? (value === null ? t('uptime.none') : `${pct(value)}%`) : '…'}
              note={note.text ?? ' '}
              tone={
                note.tone ?? (value !== null && key === '24h' && value < 99 ? 'down' : undefined)
              }
            />
          );
        })}
        <Kpi
          label={t('detail.kpi.uptime', { range: '90 d' })}
          value={
            detail.insights ? (uptime90 === null ? t('uptime.none') : `${pct(uptime90)}%`) : '…'
          }
          note={
            typeof target === 'number' ? t('detail.kpi.target', { pct: formatNumber(target) }) : ' '
          }
        />
        <Kpi
          label={t('detail.kpi.mttr')}
          value={incidents ? (mttr === null ? t('uptime.none') : formatDuration(mttr)) : '…'}
          note={
            incidents
              ? mttr === null
                ? t('detail.kpi.mttrNone')
                : recentIncidents.length === 1
                  ? t('detail.kpi.incidents.one')
                  : t('detail.kpi.incidents.other', { count: recentIncidents.length })
              : ' '
          }
        />
        <Kpi
          label={t('detail.kpi.longest')}
          value={clean ? formatDuration(clean.longest) : '…'}
          note={clean ? t('detail.kpi.current', { duration: formatDuration(clean.current) }) : ' '}
        />
      </dl>

      <Panel
        title={t('detail.latency.title')}
        actions={
          <>
            <Legend>
              <span>
                <Swatch className="bg-primary" />
                {t('detail.latency.p50')}
              </span>
              <span>
                <Swatch className="bg-info" />
                {t('detail.latency.p95')}
              </span>
              {typeof monitor?.degradedLatencyMs === 'number' && (
                <span>
                  <Swatch className="h-0.5 bg-warning" />
                  {t('detail.latency.limit', { ms: monitor.degradedLatencyMs })}
                </span>
              )}
              <span>
                <Swatch className="h-2.5 bg-destructive/50" />
                {t('detail.latency.incident')}
              </span>
            </Legend>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={range}
              onValueChange={(value) => {
                const next = UPTIME_RANGES.find((item) => item === value);
                if (next) setRange(next);
              }}
              aria-label={t('uptime.range')}
              className="ml-auto"
            >
              {UPTIME_RANGES.map((item) => (
                <ToggleGroupItem key={item} value={item} className="px-3.5 pointer-coarse:h-11">
                  {t(`uptime.range.${item}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        }
      >
        {!latencySeries && !detail.latencyFailed && <Skeleton className="h-60 w-full" />}
        {detail.latencyFailed && !latencySeries && (
          <p className="text-muted-foreground">{t('detail.loadError')}</p>
        )}
        {latencySeries && !hasLatency && (
          <p className="text-muted-foreground">{t('detail.latency.none')}</p>
        )}
        {latencySeries && hasLatency && (
          <>
            <LatencyChart
              series={latencySeries}
              incidents={incidents ?? []}
              limit={monitor?.degradedLatencyMs ?? null}
              now={now}
              range={range}
            />
            <p className="font-mono text-xs text-muted-foreground">
              {t('detail.latency.summary', {
                p50: ms(latencySeries.p50),
                p95: ms(latencySeries.p95),
                max: ms(latencySeries.max),
              })}
            </p>
          </>
        )}
      </Panel>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] items-start gap-5">
        <Panel
          title={t('detail.heat.title')}
          actions={
            <Legend>
              <span className="ml-auto flex items-center gap-1.5">
                {t('detail.heat.less')}
                {(['down', 'warn', 'high', 'full'] as const).map((level) => (
                  <i
                    key={level}
                    aria-hidden="true"
                    className={cn('size-3 rounded-[3px]', HEAT_CLASS[level])}
                  />
                ))}
                {t('detail.heat.more')}
              </span>
            </Legend>
          }
        >
          {detail.insights ? (
            <HeatMap insights={detail.insights} now={now} />
          ) : detail.insightsFailed ? (
            <p className="text-muted-foreground">{t('detail.loadError')}</p>
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </Panel>

        <Panel title={t('detail.reasons.title')}>
          {!detail.insights && !detail.insightsFailed && <Skeleton className="h-32 w-full" />}
          {detail.insightsFailed && (
            <p className="text-muted-foreground">{t('detail.loadError')}</p>
          )}
          {detail.insights && shares.length === 0 && (
            <p className="text-muted-foreground">{t('detail.reasons.none')}</p>
          )}
          {shares.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {shares.map((share) => (
                <li
                  key={share.key}
                  className="grid grid-cols-[minmax(0,9.5rem)_1fr_3rem] items-center gap-2.5 text-[0.8125rem]"
                >
                  <span className="truncate">{reasonText(share.reason, share.httpStatus)}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <b
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${share.pct}%` }}
                    />
                  </span>
                  <span className="text-right font-mono">{share.pct}%</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title={t('detail.incidents.title')}
        actions={
          incident ? (
            <Badge variant="destructive">{t('detail.incidents.ongoing', { count: 1 })}</Badge>
          ) : undefined
        }
      >
        {!incidents && !detail.incidentsFailed && <Skeleton className="h-28 w-full" />}
        {detail.incidentsFailed && !incidents && (
          <p className="text-muted-foreground">{t('incidents.error')}</p>
        )}
        {incidents && incidents.length === 0 && (
          <p className="text-muted-foreground">{t('incidents.none')}</p>
        )}
        {shown && shown.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('detail.incidents.start')}</TableHead>
                  <TableHead className="max-sm:hidden">{t('detail.incidents.end')}</TableHead>
                  <TableHead>{t('detail.incidents.duration')}</TableHead>
                  <TableHead>{t('detail.incidents.reason')}</TableHead>
                  <TableHead>{t('detail.incidents.state')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((item) => (
                  <TableRow key={item.id} className="align-top">
                    <TableCell className="font-mono">
                      {formatShortDateTime(item.startedAt)}
                    </TableCell>
                    <TableCell className="font-mono max-sm:hidden">
                      {item.endedAt === null ? t('uptime.none') : formatShortDateTime(item.endedAt)}
                    </TableCell>
                    <TableCell
                      className={cn('font-mono', item.endedAt === null && 'text-destructive')}
                    >
                      {formatDuration((item.endedAt ?? now) - item.startedAt)}
                      {item.endedAt === null && '…'}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {reasonText(item.reason, item.httpStatus)}
                      <div className="text-xs text-muted-foreground">
                        {t('detail.incidents.checks', { count: item.failedChecks })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.endedAt === null ? 'destructive' : 'secondary'}>
                        {item.endedAt === null
                          ? t('detail.incidents.open')
                          : t('detail.incidents.recovered')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!allIncidents && incidents && incidents.length > INITIAL_INCIDENTS && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setAllIncidents(true)}
              >
                {t('detail.incidents.more')}
              </Button>
            )}
          </>
        )}
      </Panel>

      <Panel title={t('detail.checks.title')}>
        {!detail.insights && !detail.insightsFailed && <Skeleton className="h-28 w-full" />}
        {detail.insights && detail.insights.recent.length === 0 && (
          <p className="text-muted-foreground">{t('detail.checks.none')}</p>
        )}
        {detail.insights && detail.insights.recent.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('detail.checks.time')}</TableHead>
                <TableHead>{t('detail.checks.result')}</TableHead>
                <TableHead>{t('detail.checks.latency')}</TableHead>
                <TableHead>{t('detail.checks.detail')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.insights.recent.map((check) => {
                const slow = isDegraded(monitor, check.status, check.latencyMs);
                return (
                  <TableRow key={check.observedAt}>
                    <TableCell className="font-mono">
                      {new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(
                        check.observedAt,
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          check.status === 'unavailable'
                            ? 'destructive'
                            : slow
                              ? 'warning'
                              : 'secondary'
                        }
                      >
                        {check.status === 'unavailable'
                          ? t('detail.checks.failed')
                          : check.status === 'unknown'
                            ? t('detail.checks.unknown')
                            : slow
                              ? t('detail.checks.slow')
                              : t('detail.checks.ok')}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {check.latencyMs === null
                        ? t('uptime.none')
                        : `${formatNumber(Math.round(check.latencyMs))} ms`}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {check.status === 'unavailable'
                        ? reasonText(check.reason, check.httpStatus)
                        : [
                            check.httpStatus ? `HTTP ${check.httpStatus}` : null,
                            slow && monitor?.degradedLatencyMs
                              ? t('detail.checks.slowDetail', { ms: monitor.degradedLatencyMs })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || t('uptime.none')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
