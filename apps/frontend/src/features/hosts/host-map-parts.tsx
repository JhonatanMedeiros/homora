import type { HostMetrics } from '@homora/integrations';
import { Badge } from '@homora/ui/badge';
import { Progress } from '@homora/ui/progress';
import { cn } from '@homora/ui/lib/utils';
import { formatNumber, t } from '@/i18n';
import {
  cpuPercent,
  gigabytes,
  usagePercent,
  type HealthCounts,
  type NodeState,
} from '@/features/hosts/host-health';

type MeterProps = {
  label: string;
  percent: number;
  title?: string;
  className?: string;
};

/** One load figure: a short name, a thin bar and the number. The text carries the value. */
export function Meter({ label, percent, title, className }: MeterProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground tabular-nums',
        className,
      )}
    >
      {label}
      <Progress aria-hidden="true" value={percent} className="h-1 w-8" />
      <span className="min-w-[2.5ch] text-right text-foreground">{percent}%</span>
    </span>
  );
}

const amount = (usage: { used: number; total: number }) =>
  t('map.meter.amount', {
    used: formatNumber(gigabytes(usage.used), { maximumFractionDigits: 1 }),
    total: formatNumber(gigabytes(usage.total), { maximumFractionDigits: 1 }),
  });

/**
 * CPU, memory and (for a node) disk load. A figure the inventory did not report is left out, never
 * drawn as zero, so a stopped guest or an old Proxmox shows nothing here.
 */
export function LoadMeters({
  metrics,
  disk = false,
  className,
}: {
  metrics?: HostMetrics;
  disk?: boolean;
  className?: string;
}) {
  if (!metrics) return null;
  const cpu = cpuPercent(metrics.cpu);
  const memory = usagePercent(metrics.memory);
  const storage = disk ? usagePercent(metrics.disk) : null;
  if (cpu === null && memory === null && storage === null) return null;
  return (
    <span className={cn('flex flex-wrap items-center gap-x-2.5 gap-y-0.5', className)}>
      {cpu !== null && <Meter label={t('map.meter.cpu')} percent={cpu} />}
      {memory !== null && (
        <Meter
          label={t('map.meter.memory')}
          percent={memory}
          title={metrics.memory ? amount(metrics.memory) : undefined}
        />
      )}
      {storage !== null && (
        <Meter
          label={t('map.meter.disk')}
          percent={storage}
          title={metrics.disk ? amount(metrics.disk) : undefined}
        />
      )}
    </span>
  );
}

const STATE_BADGE = {
  online: 'success',
  degraded: 'warning',
  offline: 'destructive',
  unknown: 'outline',
} as const;

/** Written state of a node: the word is always there, the colour only adds to it. */
export function NodeStateBadge({ state }: { state: NodeState }) {
  return <Badge variant={STATE_BADGE[state]}>{t(`hosts.node.${state}`)}</Badge>;
}

/** "5 online · 1 degraded · 1 offline": zero counts are left out, problems keep their colour. */
export function HealthSummary({ counts, className }: { counts: HealthCounts; className?: string }) {
  const parts: { key: string; text: string; tone?: string }[] = [];
  if (counts.ok > 0)
    parts.push({
      key: 'ok',
      text: t('map.health.online', { count: counts.ok }),
    });
  if (counts.degraded > 0)
    parts.push({
      key: 'degraded',
      text: t('map.health.degraded', { count: counts.degraded }),
      tone: 'text-warning',
    });
  if (counts.down > 0)
    parts.push({
      key: 'down',
      text: t('map.health.down', { count: counts.down }),
      tone: 'text-destructive',
    });
  if (counts.unknown > 0)
    parts.push({
      key: 'unknown',
      text: t('map.health.unknown', { count: counts.unknown }),
    });
  return (
    <span className={cn('truncate', className)}>
      {parts.map((part, index) => (
        <span key={part.key}>
          {index > 0 && ' · '}
          <span className={part.tone}>{part.text}</span>
        </span>
      ))}
    </span>
  );
}
