import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, ChevronRight } from 'lucide-react';
import { Button } from '@homora/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@homora/ui/popover';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Badge } from '@homora/ui/badge';
import { Spinner } from '@homora/ui/spinner';
import { cn } from '@homora/ui/lib/utils';
import { Empty, EmptyDescription, EmptyHeader } from '@homora/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
import { StatusLight } from '@/components/status-light';
import { formatDateTime, formatTime, t } from '@/i18n';
import { usePendingProposals } from '@/hooks/use-pending-proposals';
import { formatDuration, reasonText } from '@/features/uptime/uptime-view';

type Item = {
  id: number;
  serviceId: number | null;
  kind: 'down' | 'up' | 'measurement-down' | 'measurement-up';
  serviceName: string;
  confirmedAt: number;
  startedAt: number;
  endedAt: number | null;
  reason: string | null;
  httpStatus: number | null;
  readAt: number | null;
  /** Monitored without a dashboard card. */
  probe?: boolean;
};
type Result = { items: Item[]; unread: number; nextBefore: number | null };

export function AlertsBell({
  onService,
  onProposals,
}: {
  onService: (id: number, probe: boolean) => void;
  onProposals?: () => void;
}) {
  const pendingProposals = usePendingProposals('bell', true);
  const [data, setData] = useState<Result>();
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;
  const [open, setOpen] = useState(false);
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async (before?: number) => {
    const current = ++generation.current;
    try {
      const response = await fetch(`/api/inbox?limit=20${before ? `&before=${before}` : ''}`);
      if (!response.ok) throw new Error();
      const next = (await response.json()) as Result;
      if (!Array.isArray(next.items) || typeof next.unread !== 'number') throw new TypeError();
      if (current !== generation.current) return;
      setData((previous) =>
        before && previous ? { ...next, items: [...previous.items, ...next.items] } : next,
      );
      setError(null);
    } catch {
      if (current === generation.current) {
        setError('load');
      }
    }
  }, []);
  useEffect(() => {
    const counter = generation;
    void Promise.resolve().then(() => load());
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      counter.current++;
      window.clearInterval(timer);
    };
  }, [load]);
  /** `key` names the control that was pressed (it shows the spinner); null marks without one. */
  async function mark(path: string, key: string | null) {
    setBusyKey(key ?? '');
    generation.current++;
    try {
      const response = await fetch(path, { method: 'POST' });
      if (!response.ok) throw new Error();
      if (key !== null) heading.current?.focus();
      await load();
    } catch {
      setError('action');
    } finally {
      setBusyKey(null);
    }
  }
  const total = (data?.unread ?? 0) + pendingProposals;
  const label = error
    ? t(error === 'action' ? 'bell.actionError' : 'bell.error')
    : data
      ? total
        ? t('bell.count', { count: total })
        : t('bell.none')
      : t('bell.loading');
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-label={label}
          title={label}
          className="relative px-2.5"
        >
          <Bell aria-hidden="true" />
          {total > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center font-mono text-[0.625rem] leading-4 text-white"
            >
              {total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('bell.title')}
        align="end"
        className="w-[min(25rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 ref={heading} tabIndex={-1} className="font-semibold">
              {t('bell.title')}
            </h2>
            {!!data?.unread && (
              <Badge variant="secondary">{t('bell.unreadCount', { count: data.unread })}</Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !data?.unread}
            onClick={() => void mark('/api/inbox/read-all', 'all')}
          >
            {busyKey === 'all' ? <Spinner /> : <CheckCheck aria-hidden="true" />}
            <span className="max-sm:sr-only">{t('bell.readAll')}</span>
          </Button>
        </div>
        <div className="max-h-[min(60vh,32rem)] overflow-y-auto p-1.5">
          {error && (
            <Alert variant="destructive" className="mb-1.5">
              <AlertDescription>
                {t(error === 'action' ? 'bell.actionError' : 'bell.error')}
              </AlertDescription>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                {t('bell.retry')}
              </Button>
            </Alert>
          )}
          {pendingProposals > 0 && onProposals && (
            <Button
              variant="outline"
              className="mb-1.5 h-auto min-h-10 w-full justify-between whitespace-normal border-primary/40 bg-primary/10 text-left font-normal"
              onClick={() => {
                setOpen(false);
                onProposals();
              }}
            >
              {t('bell.proposals', { count: pendingProposals })}
              <ChevronRight aria-hidden="true" />
            </Button>
          )}
          {!data && !error && <RowListSkeleton label={t('bell.loading')} rows={2} />}
          {data && data.items.length === 0 && !pendingProposals && !error && (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>{t('bell.empty')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ul className="flex flex-col gap-0.5">
            {data?.items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                busy={busy}
                pressed={busyKey === String(item.id)}
                onOpen={(serviceId) => {
                  setOpen(false);
                  onService(serviceId, item.probe === true);
                  if (item.readAt === null) void mark(`/api/inbox/${item.id}/read`, null);
                }}
                onRead={() => void mark(`/api/inbox/${item.id}/read`, String(item.id))}
              />
            ))}
          </ul>
        </div>
        {data?.nextBefore && (
          <div className="flex justify-center border-t p-1.5">
            <Button variant="ghost" size="sm" onClick={() => void load(data.nextBefore!)}>
              {t('bell.more')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function formatWhen(value: number) {
  return new Date(value).toDateString() === new Date().toDateString()
    ? formatTime(value)
    : formatDateTime(value);
}

function NotificationRow({
  item,
  busy,
  pressed,
  onOpen,
  onRead,
}: {
  item: Item;
  busy: boolean;
  pressed: boolean;
  onOpen: (serviceId: number) => void;
  onRead: () => void;
}) {
  const measurement = item.kind.startsWith('measurement');
  const down = item.kind.endsWith('down');
  const unread = item.readAt === null;
  const name = measurement ? t('bell.monitoring') : item.serviceName;
  const details = [
    !measurement && item.serviceId === null ? t('bell.removed') : null,
    item.endedAt === null
      ? null
      : t('bell.duration', { duration: formatDuration(item.endedAt - item.startedAt) }),
    item.reason && !measurement ? reasonText(item.reason, item.httpStatus) : null,
  ]
    .filter((value): value is string => !!value)
    .join(' · ');
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn('truncate text-sm', unread ? 'font-semibold' : 'font-normal')}>
            {unread && <span className="sr-only">{t('bell.unread')}: </span>}
            {name}
          </span>
          {item.probe && <Badge variant="outline">{t('bell.probe')}</Badge>}
        </span>
        <time
          dateTime={new Date(item.confirmedAt).toISOString()}
          className="shrink-0 font-mono text-xs font-normal text-muted-foreground"
        >
          {formatWhen(item.confirmedAt)}
        </time>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 text-sm font-normal text-muted-foreground">
        <StatusLight
          state={measurement && down ? 'unknown' : down ? 'unavailable' : 'available'}
          label={t(
            measurement
              ? down
                ? 'bell.stateMeasurementDown'
                : 'bell.stateMeasurementUp'
              : down
                ? 'bell.stateDown'
                : 'bell.stateUp',
          )}
        />
        {details && <span>{details}</span>}
      </span>
      {measurement && (
        <span className="text-sm font-normal text-muted-foreground">
          {t('bell.measurementNote')}
        </span>
      )}
    </>
  );
  const bodyClass = 'flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2 text-left';
  return (
    <li className={cn('group flex items-center gap-1 rounded-lg pr-1', unread && 'bg-primary/10')}>
      {!measurement && item.serviceId !== null ? (
        <Button
          variant="ghost"
          className={cn(
            bodyClass,
            'h-auto min-h-11 items-stretch whitespace-normal hover:bg-accent',
          )}
          onClick={() => onOpen(item.serviceId!)}
        >
          {body}
        </Button>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
      {unread && (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={t('bell.readService', { service: name })}
          title={t('bell.read')}
          className="pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
          onClick={onRead}
        >
          {pressed ? <Spinner /> : <Check aria-hidden="true" />}
        </Button>
      )}
    </li>
  );
}
