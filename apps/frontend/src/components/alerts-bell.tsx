import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { RowListSkeleton } from '@/components/skeletons';
import { formatDateTime, t } from '@/i18n';
import { formatDuration, reasonText } from '@/lib/uptime-view';

type Item = {
  id: number;
  serviceId: number | null;
  kind: 'down' | 'up';
  serviceName: string;
  confirmedAt: number;
  startedAt: number;
  endedAt: number | null;
  reason: string | null;
  httpStatus: number | null;
  readAt: number | null;
};
type Result = { items: Item[]; unread: number; nextBefore: number | null };

export function AlertsBell({
  onService,
  open: controlledOpen,
  onOpenChange,
  onUnreadChange,
  returnFocusRef,
}: {
  onService: (id: number) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onUnreadChange?: (count: number | undefined) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [data, setData] = useState<Result>();
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const [busy, setBusy] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = (value: boolean) => {
    setLocalOpen(value);
    onOpenChange?.(value);
  };
  const generation = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(
    async (before?: number) => {
      const current = ++generation.current;
      try {
        const response = await fetch(`/api/inbox?limit=20${before ? `&before=${before}` : ''}`);
        if (!response.ok) throw new Error();
        const next = (await response.json()) as Result;
        if (!Array.isArray(next.items) || typeof next.unread !== 'number') throw new Error();
        if (current !== generation.current) return;
        setData((previous) =>
          before && previous ? { ...next, items: [...previous.items, ...next.items] } : next,
        );
        setError(null);
        onUnreadChange?.(next.unread);
      } catch {
        if (current === generation.current) {
          setError('load');
          onUnreadChange?.(undefined);
        }
      }
    },
    [onUnreadChange],
  );
  useEffect(() => {
    if (controlledOpen) void Promise.resolve().then(() => load());
  }, [controlledOpen, load]);
  useEffect(() => {
    const counter = generation;
    void Promise.resolve().then(() => load());
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      counter.current++;
      window.clearInterval(timer);
    };
  }, [load]);
  async function mark(path: string) {
    setBusy(true);
    generation.current++;
    try {
      const response = await fetch(path, { method: 'POST' });
      if (!response.ok) throw new Error();
      heading.current?.focus();
      await load();
    } catch {
      setError('action');
      onUnreadChange?.(undefined);
    } finally {
      setBusy(false);
    }
  }
  const label = error
    ? t(error === 'action' ? 'bell.actionError' : 'bell.error')
    : !data
      ? t('bell.loading')
      : data.unread
        ? t('bell.count', { count: data.unread })
        : t('bell.none');
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value && controlledOpen === undefined) void load();
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
          {!error && !!data?.unread && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center font-mono text-[0.625rem] leading-4 text-white"
            >
              {data.unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={t('bell.title')}
        align="end"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current;
          if (returnFocusRef && target?.isConnected) {
            event.preventDefault();
            target.focus();
            returnFocusRef.current = null;
          }
        }}
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b p-4">
          <h2 ref={heading} tabIndex={-1} className="font-semibold">
            {t('bell.title')}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || !data?.unread}
            onClick={() => void mark('/api/inbox/read-all')}
          >
            {t('bell.readAll')}
          </Button>
        </div>
        <div className="max-h-[min(60vh,32rem)] overflow-y-auto p-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {t(error === 'action' ? 'bell.actionError' : 'bell.error')}
              </AlertDescription>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                {t('bell.retry')}
              </Button>
            </Alert>
          )}
          {!data && !error && <RowListSkeleton label={t('bell.loading')} rows={2} />}
          {data && !data.items.length && !error && (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>{t('bell.empty')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ul className="flex flex-col gap-4">
            {data?.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 border-b pb-3 text-sm">
                <div className="flex justify-between gap-2">
                  <strong>{t(item.kind === 'down' ? 'bell.down' : 'bell.up')}</strong>
                  {item.readAt === null && <span>{t('bell.unread')}</span>}
                </div>
                {item.serviceId !== null ? (
                  <Button
                    variant="link"
                    className="h-auto min-h-10 justify-start whitespace-normal break-all p-0 text-left"
                    onClick={() => {
                      setOpen(false);
                      onService(item.serviceId!);
                    }}
                  >
                    {item.serviceName}
                  </Button>
                ) : (
                  <span>
                    {item.serviceName} · {t('bell.removed')}
                  </span>
                )}
                <time
                  dateTime={new Date(item.confirmedAt).toISOString()}
                  className="text-muted-foreground"
                >
                  {formatDateTime(item.confirmedAt)}
                </time>
                {item.reason && <span>{reasonText(item.reason, item.httpStatus)}</span>}
                {item.endedAt !== null && (
                  <span>
                    {t('bell.duration', {
                      duration: formatDuration(item.endedAt - item.startedAt),
                    })}
                  </span>
                )}
                {item.readAt === null && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={t('bell.readService', { service: item.serviceName })}
                    onClick={() => void mark(`/api/inbox/${item.id}/read`)}
                  >
                    {t('bell.read')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {data?.nextBefore && (
            <Button variant="outline" size="sm" onClick={() => void load(data.nextBefore!)}>
              {t('bell.more')}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
