import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dd
        className={cn(
          'font-mono text-base font-semibold tabular-nums',
          accent ? 'text-accent-text' : 'text-foreground',
        )}
      >
        {value}
      </dd>
      <dt className="text-sm text-muted-foreground">{label}</dt>
    </div>
  );
}

/** What needs attention at a glance, in one line: waiting proposals, active agents, approvals and the review period. */
export function AgentsSummary({
  pending,
  active,
  approved,
  ttl,
  onChangeTtl,
}: {
  pending: number | null;
  active: number | null;
  approved: number | null;
  ttl: string;
  onChangeTtl: () => void;
}) {
  const count = (value: number | null) => (value === null ? '–' : value);
  return (
    <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-2.5">
      <Stat
        label={t('agents.summary.pending')}
        value={count(pending)}
        accent={(pending ?? 0) > 0}
      />
      <Stat label={t('agents.summary.active')} value={count(active)} />
      <Stat label={t('agents.summary.approved')} value={count(approved)} />
      <div className="flex items-center gap-2 sm:ml-auto">
        <dt className="text-sm text-muted-foreground">{t('agents.summary.period')}</dt>
        <dd className="font-mono text-sm tabular-nums">{t('agents.minutes', { count: ttl })}</dd>
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onChangeTtl}>
          {t('agents.change')}
        </Button>
      </div>
    </dl>
  );
}
