import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useUptimeDetails } from '@/hooks/use-uptime-details';
import {
  UPTIME_RANGES,
  type Incident,
  type MonitorSettings,
  type Service,
  type UptimeBucket,
  type UptimeRange,
  type UptimeSummary,
} from '@homora/shared';
import { ChevronDown, X } from 'lucide-react';
import { Link, useInRouterContext } from 'react-router';
import { deltaPoints } from '@/lib/detail-view';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDateTime, formatNumber, formatShortDateTime, formatTime, t } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  barState,
  deltaText,
  formatDuration,
  reasonText,
  sparklinePaths,
  type BarState,
} from '@/lib/uptime-view';

const BAR_COLOR: Record<BarState, string> = {
  up: 'bg-success/85',
  slow: 'bg-warning',
  down: 'bg-destructive',
  partial: 'bg-[linear-gradient(to_bottom,var(--destructive)_50%,var(--success)_50%)]',
  unknown: 'bg-border',
};
const BAR_LABEL: Record<
  BarState,
  | 'status.available'
  | 'uptime.bucket.slow'
  | 'status.unavailable'
  | 'uptime.bucket.partial'
  | 'uptime.bucket.unknown'
> = {
  up: 'status.available',
  slow: 'uptime.bucket.slow',
  down: 'status.unavailable',
  partial: 'uptime.bucket.partial',
  unknown: 'uptime.bucket.unknown',
};
/** Width of one period of the bar, per range (mirrors the backend windows). */
const BUCKET_MS: Record<UptimeRange, number> = {
  '24h': 30 * 60_000,
  '7d': 2 * 3_600_000,
  '30d': 6 * 3_600_000,
};

const formatPct = (pct: number | null) =>
  pct === null ? t('uptime.none') : `${formatNumber(pct, { maximumFractionDigits: 2 })}%`;

const rangeLabel = (range: UptimeRange) => t(`uptime.range.${range}`);

/** The summary also goes in the label: colors alone say nothing to a screen reader. */
function summaryText(summary: UptimeSummary) {
  const range = rangeLabel(summary.range);
  return summary.uptimePct === null
    ? t('uptime.summaryNone', { range, checks: summary.checks })
    : t('uptime.summary', {
        pct: formatPct(summary.uptimePct),
        range,
        checks: summary.checks,
        down: summary.downChecks,
      });
}

/** Availability percentage for the selected period, or a dash while there is too little data. */
export function UptimePercent({ summary }: { summary?: UptimeSummary }) {
  if (!summary) return null;
  return (
    <span
      title={summary.uptimePct === null ? t('uptime.noneHint') : summaryText(summary)}
      className="font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums"
    >
      <span className="sr-only">{t('uptime.label', { range: rangeLabel(summary.range) })}: </span>
      {formatPct(summary.uptimePct)}
    </span>
  );
}

/** What one period says: when, how it went, why it failed and how fast it was. */
function describeBucket(bucket: UptimeBucket, state: BarState, range: UptimeRange) {
  const start = Date.parse(bucket.start);
  const end = start + BUCKET_MS[range];
  const when =
    range === '24h'
      ? `${formatTime(start)} – ${formatTime(end)}`
      : `${formatDateTime(start)} – ${formatTime(end)}`;
  const facts: string[] = [];
  if (bucket.reason) facts.push(reasonText(bucket.reason, bucket.httpStatus));
  if (typeof bucket.avgLatencyMs === 'number')
    facts.push(t('uptime.bar.latency', { ms: Math.round(bucket.avgLatencyMs) }));
  if (state === 'unknown' && !bucket.checks) facts.push(t('uptime.bar.none'));
  else if (bucket.checks) facts.push(t('uptime.bar.checks', { count: bucket.checks }));
  return { when, label: t(BAR_LABEL[state]), facts };
}

/** Latency of the period as a line; gaps without checks break it. */
function Sparkline({ summary }: { summary: UptimeSummary }) {
  const paths = sparklinePaths(
    summary.buckets.map((bucket) => bucket.avgLatencyMs),
    100,
    24,
  );
  if (!paths.length) return <span className="min-w-0 flex-1" aria-hidden="true" />;
  return (
    <svg
      role="img"
      aria-label={t('uptime.sparkline', { range: rangeLabel(summary.range) })}
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className="h-6 min-w-0 flex-1 text-primary"
    >
      {paths.map((points) => (
        <polyline
          key={points}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/**
 * A quiet, non-interactive version of the bucket bar for dense tiles: no tooltip and no focus stop,
 * because the percentage and the status next to it already say the same in words.
 */
export function UptimeMiniBar({
  summary,
  monitor,
}: {
  summary?: UptimeSummary;
  monitor?: Pick<MonitorSettings, 'degradedLatencyMs'>;
}) {
  if (!summary) return <span className="min-w-0 flex-1" aria-hidden="true" />;
  return (
    <span aria-hidden="true" className="flex h-1.5 min-w-0 flex-1 items-stretch gap-px">
      {summary.buckets.map((bucket) => (
        <span
          key={bucket.start}
          className={cn('min-w-px flex-1 rounded-[1px]', BAR_COLOR[barState(bucket, monitor)])}
        />
      ))}
    </span>
  );
}

export function UptimeBars({
  summary,
  monitor,
}: {
  summary: UptimeSummary;
  monitor?: Pick<MonitorSettings, 'degradedLatencyMs'>;
}) {
  const range = summary.range;
  const count = summary.buckets.length;
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const detailId = useId();
  const states = summary.buckets.map((bucket) => barState(bucket, monitor));
  const indexAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(
      count - 1,
      Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * count)),
    );
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = count - 1;
    const from = selected ?? last + 1;
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, from - 1)
        : event.key === 'ArrowRight'
          ? Math.min(last, from + 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : event.key === 'Escape'
                ? null
                : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setSelected(next);
  };
  const shown = hover ?? null;
  const tip =
    shown === null ? null : describeBucket(summary.buckets[shown]!, states[shown]!, range);
  const picked =
    selected === null ? null : describeBucket(summary.buckets[selected]!, states[selected]!, range);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <div
          ref={ref}
          role="group"
          tabIndex={0}
          aria-label={`${summaryText(summary)}. ${t('uptime.bar.group', { range: rangeLabel(range) })}`}
          aria-describedby={picked ? detailId : undefined}
          className="flex h-6 w-full cursor-pointer items-stretch gap-px rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-8"
          onPointerMove={(event) =>
            event.pointerType === 'mouse' && setHover(indexAt(event.clientX))
          }
          onPointerLeave={() => setHover(null)}
          onClick={(event: MouseEvent<HTMLDivElement>) => {
            const index = indexAt(event.clientX);
            setSelected((current) => (current === index ? null : index));
          }}
          onKeyDown={onKeyDown}
        >
          {summary.buckets.map((bucket, index) => (
            <span
              key={bucket.start}
              data-state={states[index]}
              className={cn(
                'min-w-px flex-1 rounded-[1px]',
                BAR_COLOR[states[index]!],
                (hover === index || selected === index) &&
                  'outline-2 outline-offset-1 outline-foreground',
              )}
            />
          ))}
        </div>
        {tip && shown !== null && (
          <div
            role="tooltip"
            style={{ left: `${((shown + 0.5) / count) * 100}%` }}
            className={cn(
              'pointer-events-none absolute bottom-full z-30 mb-2 w-max max-w-64 rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md',
              shown < count * 0.2
                ? '-translate-x-[10%]'
                : shown > count * 0.8
                  ? '-translate-x-[90%]'
                  : '-translate-x-1/2',
            )}
          >
            <div className="font-mono tabular-nums">{tip.when}</div>
            <div className="font-medium">{tip.label}</div>
            {tip.facts.map((fact) => (
              <div key={fact} className="text-muted-foreground">
                {fact}
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between font-mono text-[0.6875rem] text-muted-foreground"
      >
        <span>{t('uptime.axis.start', { range: rangeLabel(range) })}</span>
        <span>{t('uptime.axis.now')}</span>
      </div>
      <div aria-live="polite">
        {picked && selected !== null && (
          <div
            id={detailId}
            data-slot="bar-detail"
            className="flex items-start justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs"
          >
            <div className="min-w-0">
              <div className="font-mono tabular-nums">{picked.when}</div>
              <div>
                <span className="font-medium">{picked.label}</span>
                {picked.facts.length > 0 && (
                  <span className="text-muted-foreground"> · {picked.facts.join(' · ')}</span>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-my-1 -mr-1.5 size-6 shrink-0"
              aria-label={t('uptime.bar.clear')}
              onClick={() => setSelected(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Percentage, latency line and bucket bar on the card; the toggle opens latency and the period selector. */
export function ServiceUptime({
  service,
  summary,
  range,
  onRangeChange,
  monitor,
  onDetails,
}: {
  service: Service;
  summary?: UptimeSummary;
  /** Opens the details drawer; without it the link goes to the full page. */
  onDetails?: () => void;
  range: UptimeRange;
  onRangeChange: (range: UptimeRange) => void;
  /** Alert settings of the service: bars slower than its limit read as degraded. */
  monitor?: MonitorSettings;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const inRouter = useInRouterContext();
  if (!summary) return null;
  const delta = deltaText(deltaPoints(summary.uptimePct, summary.previousUptimePct));
  const detailPath = `/services/${service.id}`;
  return (
    <div className="relative z-10 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex shrink-0 items-baseline gap-2 text-sm">
          <span className="text-muted-foreground">
            {t('uptime.label', { range: rangeLabel(range) })}
          </span>
          <span className="font-mono tabular-nums">{formatPct(summary.uptimePct)}</span>
          {delta && (
            <span
              title={t('detail.deltaHint')}
              className={cn(
                'font-mono text-xs tabular-nums',
                delta.tone === 'up' && 'text-success',
                delta.tone === 'down' && 'text-destructive',
                delta.tone === 'same' && 'text-muted-foreground',
              )}
            >
              {delta.text}
            </span>
          )}
        </span>
        <Sparkline summary={summary} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-my-1 -mr-2 shrink-0"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t('uptime.toggleFor', { name: service.name })}
          onClick={() => setOpen((value) => !value)}
        >
          {t('uptime.toggle')}
          <ChevronDown
            aria-hidden="true"
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </Button>
      </div>
      <UptimeBars summary={summary} monitor={monitor} />
      <div className="flex justify-end text-xs">
        {onDetails ? (
          <button
            type="button"
            onClick={onDetails}
            aria-label={t('card.detailsFor', { name: service.name })}
            className="text-primary hover:underline"
          >
            {t('card.details')} →
          </button>
        ) : inRouter ? (
          <Link to={detailPath} className="text-primary hover:underline">
            {t('detail.link')} →
          </Link>
        ) : (
          <a href={detailPath} className="text-primary hover:underline">
            {t('detail.link')} →
          </a>
        )}
      </div>
      {open && (
        <UptimeDetails
          id={panelId}
          service={service}
          summary={summary}
          range={range}
          onRangeChange={onRangeChange}
        />
      )}
    </div>
  );
}

type IncidentList = { incidents: Incident[] };

/** The latest incidents of a service, newest first; the card shows the few that matter now. */
function RecentIncidents({ serviceId, refreshKey }: { serviceId: number; refreshKey: number }) {
  const [state, setState] = useState<
    { key: string; incidents: Incident[] } | { key: string; error: true }
  >();
  const key = `${serviceId}:${refreshKey}`;
  useEffect(() => {
    let active = true;
    fetch(`/api/services/${serviceId}/incidents?limit=3`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<IncidentList>;
      })
      .then((data) => {
        if (!Array.isArray(data?.incidents)) throw new Error();
        if (active) setState({ key, incidents: data.incidents });
      })
      .catch(() => active && setState({ key, error: true }));
    return () => {
      active = false;
    };
  }, [serviceId, key]);
  const current = state?.key === key ? state : undefined;
  return (
    <section aria-label={t('incidents.title')} className="flex flex-col gap-1.5 border-t pt-2.5">
      <h3 className="text-xs font-medium text-muted-foreground">{t('incidents.title')}</h3>
      {!current && <p className="text-muted-foreground">{t('incidents.loading')}</p>}
      {current && 'error' in current && (
        <p className="text-muted-foreground">{t('incidents.error')}</p>
      )}
      {current && 'incidents' in current && current.incidents.length === 0 && (
        <p className="text-muted-foreground">{t('incidents.none')}</p>
      )}
      {current && 'incidents' in current && (
        <ul className="flex flex-col gap-2">
          {current.incidents.map((incident) => (
            <li key={incident.id} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  incident.endedAt === null ? 'bg-destructive' : 'bg-warning',
                )}
              />
              <div className="min-w-0">
                <div className="font-medium">
                  {formatShortDateTime(incident.startedAt)} ·{' '}
                  {incident.endedAt === null
                    ? t('incidents.ongoing')
                    : formatDuration(incident.endedAt - incident.startedAt)}
                </div>
                <div className="text-muted-foreground">
                  {reasonText(incident.reason, incident.httpStatus)}
                  {incident.endedAt !== null &&
                    ` · ${t('incidents.recovered', { time: formatTime(incident.endedAt) })}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UptimeDetails({
  id,
  service,
  summary,
  range,
  onRangeChange,
}: {
  id: string;
  service: Service;
  summary: UptimeSummary;
  range: UptimeRange;
  onRangeChange: (range: UptimeRange) => void;
}) {
  // The batch omits percentiles; this hook loads p95 for the expanded single-service detail.
  const p95 = useUptimeDetails(service.id, range, summary.checks);
  const ms = (value: number | null) =>
    value === null ? t('uptime.none') : `${Math.round(value)} ms`;
  const facts: [string, string][] = [
    [t('uptime.latency'), ms(summary.lastLatencyMs)],
    [t('uptime.p95'), p95 === 'loading' ? '…' : p95 === 'error' ? t('uptime.error') : ms(p95)],
    [
      t('uptime.checks'),
      t('uptime.checksValue', {
        checks: summary.checks,
        down: summary.downChecks,
        unknown: summary.unknownChecks,
      }),
    ],
  ];
  return (
    <div id={id} className="flex flex-col gap-2.5 border-t pt-2.5 text-[0.8125rem]">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={range}
        onValueChange={(value) => {
          const next = UPTIME_RANGES.find((item) => item === value);
          if (next) onRangeChange(next);
        }}
        aria-label={t('uptime.range')}
        className="w-full"
      >
        {UPTIME_RANGES.map((item) => (
          <ToggleGroupItem key={item} value={item} className="flex-1 pointer-coarse:h-11">
            {rangeLabel(item)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {summary.reconfigured && <p className="text-muted-foreground">{t('uptime.reconfigured')}</p>}
      <RecentIncidents serviceId={service.id} refreshKey={summary.downChecks} />
    </div>
  );
}
