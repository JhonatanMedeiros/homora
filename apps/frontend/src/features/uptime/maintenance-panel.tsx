import { toast } from 'sonner';
import { useState } from 'react';
import type { Maintenance } from '@homora/shared';
import { CalendarClock } from 'lucide-react';
import { Badge } from '@homora/ui/badge';
import { Button } from '@homora/ui/button';
import { Skeleton } from '@homora/ui/skeleton';
import { apiError, formatDateTime, t } from '@/i18n';
import { MaintenanceSummary } from './maintenance-summary';

/** The maintenance windows of one service: open, scheduled and recently finished. */
export function MaintenancePanel({
  windows,
  failed,
  now,
  onChanged,
}: {
  windows?: Maintenance[];
  failed: boolean;
  now: number;
  onChanged: () => void;
}) {
  const [error, setError] = useState('');
  async function cancel(item: Maintenance) {
    setError('');
    try {
      const response = await fetch(`/api/maintenance/${item.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(apiError(body, t('maint.cancelError')));
      }
      toast.success(t('maint.cancelled'));
      onChanged();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : t('maint.cancelError');
      setError(message);
      toast.error(message);
    }
  }
  return (
    <section
      aria-label={t('maint.title')}
      className="flex flex-col gap-3.5 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t('maint.title')}</h2>
        <p className="text-[0.8125rem] text-muted-foreground">{t('maint.hint')}</p>
      </div>
      {!windows && !failed && <Skeleton className="h-14 w-full" />}
      {failed && !windows && <p className="text-muted-foreground">{t('maint.loadError')}</p>}
      {windows && windows.length === 0 && (
        <p className="text-muted-foreground">{t('maint.none')}</p>
      )}
      {windows && windows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {windows.map((item) => {
            const open = item.startsAt <= now && item.endsAt > now;
            const finished = item.endsAt <= now;
            return (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-3"
              >
                <CalendarClock aria-hidden="true" className="size-4 text-info" />
                <Badge
                  variant="outline"
                  className={
                    open
                      ? 'border-info/50 bg-info/10 text-info'
                      : finished
                        ? 'text-muted-foreground'
                        : undefined
                  }
                >
                  {open
                    ? t('maint.active', { time: formatDateTime(item.endsAt) })
                    : finished
                      ? t('maint.past')
                      : t('maint.upcoming')}
                </Badge>
                <span className="font-mono text-sm">
                  {t('maint.range', {
                    start: formatDateTime(item.startsAt),
                    end: formatDateTime(item.endsAt),
                  })}
                </span>
                {item.note && <span className="text-sm text-muted-foreground">{item.note}</span>}
                {!finished && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => void cancel(item)}
                  >
                    {open ? t('maint.end') : t('maint.cancel')}
                  </Button>
                )}
                {finished && (
                  <MaintenanceSummary serviceId={item.serviceId} windowId={item.id} now={now} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p role="alert" className="text-sm text-destructive empty:hidden">
        {error}
      </p>
    </section>
  );
}
