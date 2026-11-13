import { Bot, CheckCheck, Clock, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

function Tile({
  icon,
  label,
  value,
  accent = false,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  accent?: boolean;
  action?: ReactNode;
}) {
  return (
    <Card className={cn('py-4', accent && 'border-primary bg-primary/5')}>
      <CardContent className="flex flex-col gap-1 px-4">
        <dt className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
          {icon}
          {label}
        </dt>
        <dd className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
          {action}
        </dd>
      </CardContent>
    </Card>
  );
}

/** What needs attention at a glance: waiting proposals, active agents, approvals and the review period. */
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
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={<Inbox />}
        label={t('agents.summary.pending')}
        value={count(pending)}
        accent={(pending ?? 0) > 0}
      />
      <Tile icon={<Bot />} label={t('agents.summary.active')} value={count(active)} />
      <Tile icon={<CheckCheck />} label={t('agents.summary.approved')} value={count(approved)} />
      <Tile
        icon={<Clock />}
        label={t('agents.summary.period')}
        value={t('agents.minutes', { count: ttl })}
        action={
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={onChangeTtl}
          >
            {t('agents.change')}
          </Button>
        }
      />
    </dl>
  );
}
