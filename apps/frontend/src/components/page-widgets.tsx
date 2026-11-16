import { MoreHorizontal, Plus } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { clockWidget, defaultClockConfig } from '@homora/widgets/clock';
import { noteWidget } from '@homora/widgets/note';
import { MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Clock } from '@/components/top-bar';
import { CardWidgets } from '@/components/card-widgets';
import { WidgetErrorBoundary } from '@/components/widget-error-boundary';
import { widgetStats, type Connection } from '@/features/connections/connection-model';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import type { PageRow } from '@/hooks/use-pages';
import { PageWidgetDialog, type WidgetDraft } from '@/components/page-widget-dialog';
import { cn } from '@/lib/utils';
import { t } from '@/i18n';

const NoteContent = lazy(() =>
  import('@/components/note-content').then((module) => ({ default: module.NoteContent })),
);

type PageWidget = {
  id: number;
  pageId: number;
  type: string;
  name: string;
  config: unknown;
  connectionId: number | null;
  position: number;
  version: number;
};

function newWidgetDraft(pageId: number): WidgetDraft {
  return {
    id: null,
    pageId,
    type: 'clock',
    name: '',
    config: { ...defaultClockConfig, text: '' },
    connectionId: null,
  };
}

type Props = {
  pageId: number;
  pages: PageRow[];
  /** `rail` stacks the widgets in a narrow column beside the services; `strip` spreads them above. */
  layout?: 'strip' | 'rail';
};

/** Widgets of a page. Plain information by default; the controls appear in the card menu and organize mode. */
export function PageWidgets({ pageId, pages, layout = 'strip' }: Props) {
  const [widgets, setWidgets] = useState<PageWidget[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [readings, setReadings] = useState<Record<number, CardWidgetState>>({});
  /** Last good reading of each widget, so a failing connection shows old data marked as such. */
  const lastGood = useRef<Record<number, CardWidgetState & { status: 'ready' }>>({});
  const [draft, setDraft] = useState<WidgetDraft | null>(null);
  const [chosen, setChosen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  /** Insertion slot among the page's widgets (0 = before the first, n = after the last). */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [removing, setRemoving] = useState<PageWidget | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const response = await fetch('/api/page-widgets');
    if (!response.ok) throw new Error();
    setWidgets((await response.json()) as PageWidget[]);
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([
      // Initial load synchronizes this view with the server.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reload(),
      fetch('/api/connections').then((response) => (response.ok ? response.json() : [])),
    ])
      .then(([, rows]) => {
        if (active) setConnections(rows as Connection[]);
      })
      .catch(() => {
        if (active) setError(t('pageWidgets.loadFailed'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number;
    const cycle = async () => {
      const connected = widgets.filter(
        (widget) => widget.connectionId !== null && widget.version === 1,
      );
      const results = new Map<number, unknown>();
      await Promise.all(
        [...new Set(connected.map((widget) => widget.connectionId!))].map(async (id) => {
          try {
            const response = await fetch(`/api/connections/${id}/data`, {
              signal: controller.signal,
            });
            if (!response.ok) throw new Error();
            results.set(id, ((await response.json()) as { data: unknown }).data);
          } catch {
            results.set(id, null);
          }
        }),
      );
      if (controller.signal.aborted) return;
      const next: Record<number, CardWidgetState> = {};
      for (const item of connected) {
        const widget = {
          id: item.id,
          integrationId: item.connectionId!,
          type: item.type,
          name:
            item.name ||
            connections.find((connection) => connection.id === item.connectionId)?.name ||
            item.type,
          serviceId: null,
        };
        const data = results.get(item.connectionId!);
        let stats: ReturnType<typeof widgetStats> = null;
        try {
          if (data) stats = widgetStats(item.type, data);
        } catch {
          /* Isolate a broken presentation. */
        }
        const good = lastGood.current[item.id];
        if (data && stats) {
          const fresh = {
            widget,
            status: 'ready' as const,
            stats,
            checkedAt: new Date().toISOString(),
          };
          lastGood.current[item.id] = fresh;
          next[item.id] = fresh;
        } else if (!data && good) {
          next[item.id] = { ...good, widget, stale: true };
        } else {
          next[item.id] = data ? { widget, status: 'invalid' } : { widget, status: 'error' };
        }
      }
      setReadings(next);
      timer = window.setTimeout(() => void cycle(), 60_000);
    };
    void cycle();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [widgets, connections]);
  const current = widgets.filter((item) => item.pageId === pageId);
  const full = current.length >= MAX_WIDGETS_PER_PAGE;
  const fullPages = new Set(
    pages
      .filter(
        (page) => widgets.filter((item) => item.pageId === page.id).length >= MAX_WIDGETS_PER_PAGE,
      )
      .map((page) => page.id),
  );
  async function change(url: string, method: string, body?: unknown) {
    if (busy) return false;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error();
      await reload();
      setError('');
      return true;
    } catch {
      setError(t('pageWidgets.failed'));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const openAdd = () => {
    setChosen(false);
    setDraft(newWidgetDraft(pageId));
  };
  const reorder = (id: number, to: number) => {
    const ids = current.map((entry) => entry.id);
    const from = ids.indexOf(id);
    if (from < 0 || to < 0 || to >= ids.length || from === to) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    // Show the new order at once; the request below reloads the stored one.
    setWidgets((rows) => {
      const slots = rows.flatMap((row, i) => (row.pageId === pageId ? [i] : []));
      const next = [...rows];
      ids.forEach((widgetId, i) => {
        next[slots[i]!] = rows.find((row) => row.id === widgetId)!;
      });
      return next;
    });
    void change('/api/page-widgets/order', 'PUT', { pageId, ids }).then((ok) => {
      if (!ok) void reload();
    });
  };
  const draggedIndex = current.findIndex((entry) => entry.id === dragId);
  /** A slot next to the dragged card changes nothing, so it gets no marker. */
  const markable = (slot: number) =>
    dragId !== null && dropAt === slot && slot !== draggedIndex && slot !== draggedIndex + 1;
  const endDrag = () => {
    setDragId(null);
    setDropAt(null);
  };
  const dropHere = () => {
    if (dragId !== null && dropAt !== null && draggedIndex >= 0) {
      reorder(dragId, dropAt > draggedIndex ? dropAt - 1 : dropAt);
    }
    endDrag();
  };
  if (!pageId) return null;
  return (
    <section aria-label={t('pageWidgets.title')} className="flex flex-col gap-3">
      {error && !draft && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('common.loading')}
        </p>
      )}
      {!loading && (
        <div
          role="list"
          className={
            layout === 'rail' ? 'flex flex-col gap-3' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
          }
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);
          }}
        >
          {current.map((item, index) => {
            const displayName =
              item.name ||
              (item.type === 'clock'
                ? t('pageWidgets.clock')
                : item.type === 'note'
                  ? t('pageWidgets.note')
                  : (connections.find((connection) => connection.id === item.connectionId)?.name ??
                    item.type));
            const config =
              item.type === 'clock' && item.version === 1
                ? clockWidget.parseConfig(item.config)
                : null;
            const noteConfig =
              item.type === 'note' && item.version === 1
                ? noteWidget.parseConfig(item.config)
                : null;
            const base = {
              widget: {
                id: item.id,
                integrationId: item.connectionId ?? 0,
                type: item.type,
                name: displayName,
                serviceId: null,
              },
            };
            const missingConnection =
              item.type !== 'clock' &&
              item.type !== 'note' &&
              !loading &&
              !connections.some((connection) => connection.id === item.connectionId);
            const state: CardWidgetState =
              item.version === 1
                ? missingConnection
                  ? { ...base, status: 'unconfigured' }
                  : (readings[item.id] ?? { ...base, status: 'loading' })
                : { ...base, status: 'invalid' };
            const edit = () => {
              setChosen(true);
              setDraft({
                id: item.id,
                pageId: item.pageId,
                type: item.type,
                name: item.name,
                connectionId: item.connectionId,
                config: { ...(config ?? defaultClockConfig), text: noteConfig?.text ?? '' },
              });
            };
            const movePage = (target: number) =>
              void change(`/api/page-widgets/${item.id}`, 'PUT', {
                pageId: target,
                type: item.type,
                name: item.name,
                connectionId: item.connectionId,
                config:
                  item.type === 'clock'
                    ? (config ?? defaultClockConfig)
                    : item.type === 'note'
                      ? (noteConfig ?? { text: '' })
                      : {},
              });
            return (
              <article
                key={item.id}
                role="listitem"
                draggable={current.length > 1}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(item.id));
                  setDragId(item.id);
                }}
                onDragEnd={endDrag}
                onDragOver={(event) => {
                  if (dragId === null) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const box = event.currentTarget.getBoundingClientRect();
                  const sideBySide =
                    layout === 'strip' && window.matchMedia('(min-width: 640px)').matches;
                  const after = sideBySide
                    ? event.clientX > box.left + box.width / 2
                    : event.clientY > box.top + box.height / 2;
                  setDropAt(index + (after ? 1 : 0));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropHere();
                }}
                className={cn(
                  'group relative flex min-w-0 flex-col gap-3 rounded-md border bg-card p-3',
                  current.length > 1 &&
                    'cursor-grab active:cursor-grabbing pointer-coarse:cursor-default',
                  dragId === item.id && 'border-dashed opacity-40',
                )}
              >
                {markable(index) && <DropMarker edge="start" stacked={layout === 'rail'} />}
                {index === current.length - 1 && markable(current.length) && (
                  <DropMarker edge="end" stacked={layout === 'rail'} />
                )}
                <h3 className="truncate pr-24 text-sm font-medium">{displayName}</h3>
                <WidgetErrorBoundary key={`${item.type}:${item.id}`}>
                  {item.type === 'clock' ? (
                    config ? (
                      <Clock preferences={config} />
                    ) : (
                      <p>{t('cardWidget.invalid')}</p>
                    )
                  ) : item.type === 'note' ? (
                    noteConfig ? (
                      <Suspense
                        fallback={
                          <p role="status" className="text-sm text-muted-foreground">
                            {t('common.loading')}
                          </p>
                        }
                      >
                        <NoteContent text={noteConfig.text} />
                      </Suspense>
                    ) : (
                      <p>{t('cardWidget.invalid')}</p>
                    )
                  ) : (
                    <CardWidgets widgets={[state]} />
                  )}
                </WidgetErrorBoundary>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:size-11 pointer-coarse:opacity-100"
                      aria-label={t('pageWidgets.options', { name: displayName })}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem disabled={item.version !== 1} onSelect={edit}>
                      {t('common.edit')}
                    </DropdownMenuItem>
                    {pages.length > 1 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>{t('pageWidgets.movePage')}</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {pages
                            .filter((page) => page.id !== item.pageId)
                            .map((page) => (
                              <DropdownMenuItem
                                key={page.id}
                                disabled={item.version !== 1 || fullPages.has(page.id)}
                                onSelect={() => movePage(page.id)}
                              >
                                {page.name}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    {current.length > 1 && (
                      <>
                        <DropdownMenuItem
                          disabled={index === 0}
                          onSelect={() => reorder(item.id, index - 1)}
                        >
                          {t('pageWidgets.moveBefore')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={index === current.length - 1}
                          onSelect={() => reorder(item.id, index + 1)}
                        >
                          {t('pageWidgets.moveAfter')}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(item)}>
                      {t('common.remove')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </article>
            );
          })}
          {full ? (
            <p className="flex min-h-24 items-center justify-center rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              {t('pageWidgets.limit', { max: MAX_WIDGETS_PER_PAGE })}
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-24 border-dashed text-muted-foreground"
              onClick={openAdd}
              onDragOver={(event) => {
                if (dragId === null) return;
                event.preventDefault();
                setDropAt(current.length);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropHere();
              }}
            >
              <Plus />
              {t('pageWidgets.addTile')}
            </Button>
          )}
        </div>
      )}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pageWidgets.removeConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{removing?.name || removing?.type}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) void change(`/api/page-widgets/${removing.id}`, 'DELETE');
                setRemoving(null);
              }}
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageWidgetDialog
        draft={draft}
        chosen={chosen}
        connections={connections}
        pages={pages}
        busy={busy}
        error={error}
        onChange={setDraft}
        onChoose={setChosen}
        onClose={() => setDraft(null)}
        onSubmit={() => {
          if (!draft) return;
          const { id, ...body } = draft;
          void change(id ? `/api/page-widgets/${id}` : '/api/page-widgets', id ? 'PUT' : 'POST', {
            ...body,
            config:
              body.type === 'clock'
                ? {
                    hourFormat: body.config.hourFormat,
                    timeZone: body.config.timeZone,
                    seconds: body.config.seconds,
                    date: body.config.date,
                  }
                : body.type === 'note'
                  ? { text: body.config.text }
                  : {},
          }).then((ok) => {
            if (ok) setDraft(null);
          });
        }}
      />
    </section>
  );
}

/** Insertion bar in the gap before or after a card: vertical beside it, horizontal when stacked. */
function DropMarker({ edge, stacked }: { edge: 'start' | 'end'; stacked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute z-10 rounded-full bg-primary',
        stacked ? 'inset-x-0 h-1' : 'inset-x-0 h-1 sm:inset-x-auto sm:inset-y-0 sm:h-auto sm:w-1',
        edge === 'start'
          ? stacked
            ? '-top-2'
            : '-top-2 sm:top-0 sm:-left-2'
          : stacked
            ? '-bottom-2'
            : '-bottom-2 sm:bottom-0 sm:-right-2',
      )}
    />
  );
}
