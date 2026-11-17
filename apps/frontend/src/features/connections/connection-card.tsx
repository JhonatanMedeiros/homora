import { ChevronRight } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Card } from '@homora/ui/card';
import { formatAgo, t } from '@/i18n';
import { cn } from '@homora/ui/lib/utils';
import { ConnectionMark } from './connection-mark';
import { HealthLight } from './health-light';
import { healthOf, hostOf, labels, reasonKey, type Connection } from './connection-model';

/** One connection. The whole card opens its details; the name is the control that carries it. */
export function ConnectionCard({
  item,
  onOpen,
}: {
  item: Connection;
  onOpen: (item: Connection) => void;
}) {
  const health = healthOf(item);
  return (
    <Card
      className={cn(
        'relative w-full min-w-0 gap-3 p-4 transition-colors hover:border-ring',
        health === 'failed' && 'border-destructive/50',
      )}
    >
      <div className="flex items-center gap-3">
        <ConnectionMark type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Button
            type="button"
            variant="link"
            aria-label={t('connections.open', { name: item.name })}
            onClick={() => onOpen(item)}
            className="h-auto justify-start p-0 text-base font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:no-underline"
          >
            <span className="truncate">{item.name}</span>
          </Button>
          <span className="truncate text-sm text-muted-foreground">
            {labels[item.type] ?? item.type} ·{' '}
            <span className="font-mono text-[0.8125rem]">{hostOf(item.url)}</span>
          </span>
        </div>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <HealthLight health={health} />
        {item.lastTest && (
          <span className="text-xs text-muted-foreground">
            {t('connections.testedAt', { time: formatAgo(item.lastTest.at) })}
          </span>
        )}
      </div>
      {health === 'failed' && item.lastTest && (
        <p className="text-sm text-destructive">{t(reasonKey(item.lastTest.result))}</p>
      )}
    </Card>
  );
}
