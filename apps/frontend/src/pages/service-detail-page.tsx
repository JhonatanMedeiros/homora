import { useState } from 'react';
import { IncidentInvestigationDialog } from '@/features/investigation/incident-investigation-dialog';
import {
  CERT_WARNING_DAYS,
  isDegraded,
  UPTIME_RANGES,
  type Service,
  type UptimeRange,
} from '@homora/shared';
import { ArrowLeft } from 'lucide-react';
import { MaintenanceDialog } from '@/features/uptime/maintenance-dialog';
import { MaintenancePanel } from '@/features/uptime/maintenance-panel';
import { ServiceIcon } from '@/components/service-icon';
import { StatusLight } from '@/components/status-light';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Skeleton } from '@homora/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@homora/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@homora/ui/toggle-group';
import { useNow } from '@/hooks/use-now';
import { useStatusOverview } from '@/hooks/use-status-overview';
import { useServiceDetail } from '@/hooks/use-service-detail';
import { formatDateTime, formatNumber, formatShortDateTime, formatTime, t } from '@/i18n';
import { deltaPoints, heatUptime, longestClean, reasonShares } from '@/lib/detail-view';
import { hostOf, type ServiceStatus } from '@/lib/services';
import { describeStatus } from '@/lib/status-text';
import { formatDuration, reasonText } from '@/features/uptime/uptime-view';
import { cn } from '@homora/ui/lib/utils';
import {
  Panel,
  Kpi,
  LatencyChart,
  HeatMap,
  Legend,
  Swatch,
  Skeletons,
} from '@/features/uptime/detail-parts';
import {
  DAY,
  pct,
  ms,
  INITIAL_INCIDENTS,
  HEAT_CLASS,
  deltaNote,
} from '@/features/uptime/detail-format';

type Props = {
  id: number;
  services: Service[];
  loaded: boolean;
  statuses: Record<number, ServiceStatus>;
  blockedIds: Set<number>;
  navigate: (path: string) => void;
};

/** One service in depth: the numbers, latency over time, 90 days of availability, why it failed and its incidents. */
/** Fewer measured periods than this are listed in the summary line, not charted. */
const MIN_CHART_POINTS = 3;

const SPAN = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY } as const;

export function ServiceDetailPage({ id, services, loaded, statuses, blockedIds, navigate }: Props) {
  const overview = useStatusOverview();
  const service = services.find((item) => item.id === id);
  const [range, setRange] = useState<UptimeRange>('24h');
  const [allIncidents, setAllIncidents] = useState(false);
  const [investigationId, setInvestigationId] = useState<number | null>(null);
  const now = useNow();
  const [maintenanceVersion, setMaintenanceVersion] = useState(0);
  const [scheduling, setScheduling] = useState(false);
  const detail = useServiceDetail(id, range, maintenanceVersion);
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
    checkType: service.checkType,
    maintenanceUntil: detail.maintenance?.find((item) => item.startsAt <= now && item.endsAt > now)
      ?.endsAt,
  });
  const incidents = detail.incidents;
  const recentIncidents = incidents?.filter((item) => item.startedAt >= now - 30 * DAY) ?? [];
  const recovered = recentIncidents.filter((item) => item.endedAt !== null);
  const mttr =
    recovered.length > 0
      ? recovered.reduce((sum, item) => sum + ((item.endedAt ?? 0) - item.startedAt), 0) /
        recovered.length
      : null;
  const heat = detail.insights?.heat ?? [];
  const oldest = heat.find((row) => row.up + row.down + row.unknown > 0)?.hour;
  const firstData = oldest ?? now - 30 * DAY;
  /** How far back the checks actually go; a longer period only says what this stretch did. */
  const measuredFor = oldest === undefined ? null : Math.max(0, now - oldest);
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
  // One or two buckets draw as stray dots, which reads as a broken chart.
  const measured = latencySeries?.points.filter((point) => point.checks > 0).length ?? 0;
  const hasLatency = measured > 0;

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
          className="inline-flex items-center gap-1 text-accent-text hover:underline"
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
        <span className="grid size-13 shrink-0 place-items-center rounded-xl bg-muted text-xl font-semibold text-accent-text [&_img]:size-7 [&_svg]:size-6">
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
        <Button variant="outline" className="ml-auto" onClick={() => setScheduling(true)}>
          {t('maint.schedule')}
        </Button>
      </header>
      {scheduling && (
        <MaintenanceDialog
          open
          serviceId={id}
          serviceName={service.name}
          services={services}
          onOpenChange={setScheduling}
          onScheduled={() => setMaintenanceVersion((value) => value + 1)}
        />
      )}

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

      {kpis.every(({ range: key }) => detail.uptime[key]?.uptimePct === null) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('detail.collecting')}
        </p>
      )}

      <dl
        aria-label={t('detail.kpi.label')}
        className="m-0 grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-3"
      >
        {kpis.map(({ range: key, context }) => {
          const summary = detail.uptime[key];
          const value = summary?.uptimePct ?? null;
          // A period with a comparison has older checks than itself, so it is not short.
          const short =
            value !== null &&
            typeof summary?.previousUptimePct !== 'number' &&
            measuredFor !== null &&
            measuredFor < SPAN[key] * 0.9;
          const note: ReturnType<typeof deltaNote> = short
            ? {
                text: t('detail.kpi.measured', { duration: formatDuration(measuredFor) }),
                tone: undefined,
              }
            : deltaNote(deltaPoints(value, summary?.previousUptimePct), context);
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
            uptime90 !== null && measuredFor !== null && measuredFor < 90 * DAY * 0.9
              ? t('detail.kpi.measured', { duration: formatDuration(measuredFor) })
              : typeof target === 'number'
                ? t('detail.kpi.target', { pct: formatNumber(target) })
                : ' '
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
            {measured < MIN_CHART_POINTS ? (
              <p className="text-muted-foreground">{t('detail.latency.collecting')}</p>
            ) : (
              <LatencyChart
                series={latencySeries}
                incidents={incidents ?? []}
                limit={monitor?.degradedLatencyMs ?? null}
                now={now}
                range={range}
              />
            )}
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
          {typeof status?.certExpiresAt === 'number' && (
            <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 border-t pt-3.5 text-sm">
              <dt className="text-muted-foreground">{t('detail.cert.title')}</dt>
              <dd className="m-0 flex flex-wrap items-center gap-2">
                {(() => {
                  const days = Math.ceil((status.certExpiresAt - now) / DAY);
                  const expired = days < 0;
                  const soon = !expired && days <= CERT_WARNING_DAYS;
                  return (
                    <>
                      <Badge variant={expired ? 'destructive' : soon ? 'warning' : 'success'}>
                        {t(
                          expired
                            ? 'detail.cert.expired'
                            : soon
                              ? 'detail.cert.expiring'
                              : 'detail.cert.valid',
                        )}
                      </Badge>
                      <span className="font-mono text-[0.8125rem]">
                        {expired
                          ? t('detail.cert.expiredOn', {
                              date: formatDateTime(status.certExpiresAt),
                            })
                          : t('detail.cert.expires', {
                              days,
                              date: formatDateTime(status.certExpiresAt),
                            })}
                      </span>
                    </>
                  );
                })()}
              </dd>
            </dl>
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
                  <TableHead>
                    <span className="sr-only">{t('investigation.open')}</span>
                  </TableHead>
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
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t('investigation.openFor', { id: item.id })}
                        onClick={() => setInvestigationId(item.id)}
                      >
                        {t('investigation.open')}
                      </Button>
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

      <MaintenancePanel
        windows={detail.maintenance}
        failed={detail.maintenanceFailed}
        now={now}
        onChanged={() => setMaintenanceVersion((value) => value + 1)}
      />

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
      <IncidentInvestigationDialog
        incidentId={investigationId}
        onClose={() => setInvestigationId(null)}
      />
    </div>
  );
}
