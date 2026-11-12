import { useEffect, useId, useState } from 'react';
import { UPTIME_RANGES, type Service, type UptimeRange, type UptimeSummary } from '@homora/shared';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDateTime, formatNumber, t } from '@/i18n';
import { cn } from '@/lib/utils';

const BUCKET_COLOR = {
  up: 'bg-success/85',
  down: 'bg-destructive',
  partial: 'bg-[linear-gradient(to_bottom,var(--destructive)_50%,var(--success)_50%)]',
  unknown: 'bg-border',
} as const;

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

function UptimeBars({ summary }: { summary: UptimeSummary }) {
  return (
    <div
      role="img"
      aria-label={summaryText(summary)}
      className="flex h-4 w-full items-stretch gap-px"
    >
      {summary.buckets.map((bucket) => (
        <span
          key={bucket.start}
          title={`${formatDateTime(bucket.start)} · ${t(`uptime.bucket.${bucket.status}`)}`}
          className={cn('min-w-px flex-1 rounded-[1px]', BUCKET_COLOR[bucket.status])}
        />
      ))}
    </div>
  );
}

/** Percentage and bucket bar on the card; the toggle opens latency and the period selector. */
export function ServiceUptime({
  service,
  summary,
  range,
  onRangeChange,
}: {
  service: Service;
  summary?: UptimeSummary;
  range: UptimeRange;
  onRangeChange: (range: UptimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!summary) return null;
  return (
    <div className="relative z-10 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-baseline gap-2 text-sm">
          <span className="text-muted-foreground">
            {t('uptime.label', { range: rangeLabel(range) })}
          </span>
          <span className="font-mono tabular-nums">{formatPct(summary.uptimePct)}</span>
        </span>
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
      <UptimeBars summary={summary} />
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

function UptimeDetails({
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
  // The batch leaves out the percentile; the single-service endpoint has it.
  const key = `${service.id}:${range}:${summary.checks}`;
  const [result, setResult] = useState<{ key: string; p95: number | null | 'error' }>();
  const p95 = result?.key === key ? result.p95 : 'loading';
  useEffect(() => {
    let active = true;
    fetch(`/api/services/${service.id}/uptime?range=${range}`)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<UptimeSummary>;
      })
      .then((data) => active && setResult({ key, p95: data.p95LatencyMs ?? null }))
      .catch(() => active && setResult({ key, p95: 'error' }));
    return () => {
      active = false;
    };
  }, [service.id, range, key]);
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
    </div>
  );
}
