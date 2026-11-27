import { CERT_WARNING_DAYS, type StatusOverview, type UptimeRange } from '@homora/shared';
import type { ReactNode } from 'react';
import { Progress } from '@homora/ui/progress';
import { cn } from '@homora/ui/lib/utils';
import { formatDuration } from '@/features/uptime/uptime-view';
import { formatNumber, t } from '@/i18n';

export const pct = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });

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

/** Availability, incidents, recovery time and the soonest certificate, as a grid of figures. */
export function HealthFigures({
  average,
  monitored,
  range,
  overview,
  certs,
  className,
}: {
  /** Mean availability over `range`; null while there is no history. */
  average: number | null;
  /** How many entries are being checked. */
  monitored: number;
  range: UptimeRange;
  overview?: StatusOverview;
  certs: { name: string; days: number }[];
  className?: string;
}) {
  const delta = overview ? overview.incidents7d - overview.incidentsPrevious7d : 0;
  const incidentNote = overview
    ? overview.incidents7d === 0 && overview.incidentsPrevious7d === 0
      ? t('banner.incidents.none')
      : delta === 0
        ? t('banner.incidents.same')
        : delta < 0
          ? t('banner.incidents.fewer', { count: -delta })
          : t('banner.incidents.more', { count: delta })
    : '';
  return (
    <dl
      className={cn(
        'm-0 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2',
        className,
      )}
    >
      <Stat
        label={t('banner.stat.uptime', { range: t(`uptime.range.${range}`) })}
        value={average === null ? t('uptime.none') : `${pct(average)}%`}
        note={
          monitored === 1
            ? t('banner.stat.uptimeSub.one')
            : t('banner.stat.uptimeSub.other', { count: monitored })
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
            value={overview.mttrMs === null ? t('uptime.none') : formatDuration(overview.mttrMs)}
            note={
              overview.mttrMs === null
                ? t('banner.mttr.none')
                : t('banner.mttr.longest', { duration: formatDuration(overview.longestCleanMs) })
            }
          />
        </>
      )}
      {certs.length > 0 && <CertStat certs={certs} />}
    </dl>
  );
}

/** Mean availability of the entries that have history, to two decimals. */
export function averageUptime(
  entries: { id: number }[],
  uptime: Record<number, { uptimePct: number | null }>,
): number | null {
  const values = entries
    .map((entry) => uptime[entry.id]?.uptimePct)
    .filter((value): value is number => typeof value === 'number');
  return values.length > 0
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
    : null;
}

/** The month against its availability target, with how much of the error budget is left. */
export function ErrorBudget({ sla }: { sla: StatusOverview['sla'] }) {
  const budget = sla.actualPct === null ? null : 100 - sla.targetPct;
  const left =
    sla.actualPct !== null && budget
      ? Math.max(0, Math.min(100, Math.round((1 - (100 - sla.actualPct) / budget) * 100)))
      : null;
  if (sla.actualPct === null || left === null)
    return <span className="text-muted-foreground">{t('banner.sla.none')}</span>;
  return (
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
  );
}
