import { Card } from '@homora/ui/card';
import { t } from '@/i18n';
import { cn } from '@homora/ui/lib/utils';
import { healthOf, type Connection, type IntegrationWidget } from './connection-model';

/** How many connections work and how many need a look, at a glance. */
export function ConnectionsSummary({
  items,
  widgets,
}: {
  items: Connection[];
  widgets: IntegrationWidget[];
}) {
  const working = items.filter((item) => healthOf(item) === 'ok').length;
  const attention = items.filter((item) => healthOf(item) === 'failed').length;
  const tiles = [
    { label: t('connections.summary.total'), value: items.length, alert: false },
    { label: t('connections.summary.working'), value: working, alert: false },
    { label: t('connections.summary.attention'), value: attention, alert: attention > 0 },
    { label: t('connections.summary.widgets'), value: widgets.length, alert: false },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          className={cn('gap-1 px-4 py-3', tile.alert && 'border-destructive/50')}
        >
          <dt className={cn('text-sm', tile.alert ? 'text-destructive' : 'text-muted-foreground')}>
            {tile.label}
          </dt>
          <dd className="text-2xl font-semibold tabular-nums">{tile.value}</dd>
        </Card>
      ))}
    </dl>
  );
}
