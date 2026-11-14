import { type ReactNode } from 'react';
import {
  type Incident,
  type LatencySeries,
  type ServiceInsights,
  type UptimeRange,
} from '@homora/shared';
import { LoadingRegion } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatTime, t } from '@/i18n';
import { CHART, heatDays, latencyGeometry } from '@/lib/detail-view';
import { cn } from '@/lib/utils';
import { pct, shortDate, HEAT_CLASS } from '@/features/uptime/detail-format';

export function Panel({
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

export function Kpi({
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

export function LatencyChart({
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
            strokeLinecap="round"
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
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

export function HeatMap({ insights, now }: { insights: ServiceInsights; now: number }) {
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

export function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground">
      {children}
    </div>
  );
}

export function Swatch({ className }: { className: string }) {
  return (
    <i
      aria-hidden="true"
      className={cn('mr-1.5 inline-block h-[3px] w-3.5 rounded-sm align-middle', className)}
    />
  );
}

export function Skeletons() {
  return (
    <LoadingRegion label={t('common.loading')} className="flex flex-col gap-5">
      <Skeleton className="h-14 w-1/2" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-72 w-full" />
    </LoadingRegion>
  );
}
