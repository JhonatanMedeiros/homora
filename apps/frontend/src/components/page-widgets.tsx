import { GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { clockWidget, defaultClockConfig } from '@homora/widgets/clock';
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
    config: defaultClockConfig,
    connectionId: null,
  };
}

type Props = { pageId: number; pages: PageRow[] };

/** Widgets of a page. Plain information by default; the controls appear in the card menu and organize mode. */
export function PageWidgets({ pageId, pages }: Props) {
  const [organizing, setOrganizing] = useState(false);
  const [widgets, setWidgets] = useState<PageWidget[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [readings, setReadings] = useState<Record<number, CardWidgetState>>({});
  const [draft, setDraft] = useState<WidgetDraft | null>(null);
  const [chosen, setChosen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
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
        next[item.id] = !data
          ? { widget, status: 'error' }
          : stats
            ? { widget, status: 'ready', stats }
            : { widget, status: 'invalid' };
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
    void change('/api/page-widgets/order', 'PUT', { pageId, ids });
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
      {organizing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2">
          <p className="text-sm text-muted-foreground">{t('pageWidgets.organizeHelp')}</p>
          <Button type="button" size="sm" onClick={() => setOrganizing(false)}>
            {t('page.done')}
          </Button>
        </div>
      )}
      {!organizing && !loading && current.length === 0 && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={openAdd}>
            <Plus />
            {t('pageWidgets.add')}
          </Button>
        </div>
      )}
      {(current.length > 0 || organizing) && (
        <div
          role={organizing ? 'list' : undefined}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {current.map((item, index) => {
            const displayName =
              item.name ||
              (item.type === 'clock'
                ? t('pageWidgets.clock')
                : (connections.find((connection) => connection.id === item.connectionId)?.name ??
                  item.type));
            const config =
              item.type === 'clock' && item.version === 1
                ? clockWidget.parseConfig(item.config)
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
            const state: CardWidgetState =
              item.version !== 1
                ? { ...base, status: 'invalid' }
                : (readings[item.id] ?? { ...base, status: 'loading' });
            const edit = () => {
              setChosen(true);
              setDraft({
                id: item.id,
                pageId: item.pageId,
                type: item.type,
                name: item.name,
                connectionId: item.connectionId,
                config: config ?? defaultClockConfig,
              });
            };
            const movePage = (target: number) =>
              void change(`/api/page-widgets/${item.id}`, 'PUT', {
                pageId: target,
                type: item.type,
                name: item.name,
                connectionId: item.connectionId,
                config: item.type === 'clock' ? (config ?? defaultClockConfig) : {},
              });
            const onGripKey = (event: KeyboardEvent) => {
              const step =
                event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? -1
                  : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                    ? 1
                    : 0;
              if (!step) return;
              event.preventDefault();
              reorder(item.id, index + step);
            };
            return (
              <article
                key={item.id}
                role={organizing ? 'listitem' : undefined}
                draggable={organizing}
                onDragStart={() => setDragId(item.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(event) => {
                  if (!organizing || dragId === null) return;
                  event.preventDefault();
                  setOverId(item.id);
                }}
                onDragLeave={() => setOverId((value) => (value === item.id ? null : value))}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragId !== null) reorder(dragId, index);
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  'group relative flex min-w-0 flex-col gap-3 rounded-md border bg-card p-3',
                  organizing && 'cursor-grab border-dashed pointer-coarse:cursor-default',
                  dragId === item.id && 'opacity-50',
                  overId === item.id && dragId !== item.id && 'border-primary bg-primary/10',
                )}
              >
                <h3 className="truncate pr-24 text-sm font-medium">{displayName}</h3>
                <WidgetErrorBoundary key={`${item.type}:${item.id}`}>
                  {item.type === 'clock' ? (
                    config ? (
                      <Clock preferences={config} />
                    ) : (
                      <p>{t('cardWidget.invalid')}</p>
                    )
                  ) : (
                    <CardWidgets widgets={[state]} />
                  )}
                </WidgetErrorBoundary>
                {organizing ? (
                  <div className="absolute top-1.5 right-1.5 flex items-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-coarse:size-11"
                      aria-label={`${t('common.edit')}: ${displayName}`}
                      disabled={item.version !== 1}
                      onClick={edit}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="pointer-coarse:size-11"
                      aria-label={`${t('pageWidgets.remove')}: ${displayName}`}
                      onClick={() => setRemoving(item)}
                    >
                      <Trash2 />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="cursor-grab pointer-coarse:size-11"
                      aria-label={t('pageWidgets.drag', { name: displayName })}
                      aria-description={t('pageWidgets.position', {
                        name: displayName,
                        position: index + 1,
                        total: current.length,
                      })}
                      onKeyDown={onGripKey}
                    >
                      <GripVertical />
                    </Button>
                  </div>
                ) : (
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
                          <DropdownMenuSubTrigger>
                            {t('pageWidgets.movePage')}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {pages
                              .filter((page) => page.id !== item.pageId)
                              .map((page) => (
                                <DropdownMenuItem
                                  key={page.id}
                                  disabled={item.version !== 1}
                                  onSelect={() => movePage(page.id)}
                                >
                                  {page.name}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuItem onSelect={() => setOrganizing(true)}>
                        {t('pageWidgets.reorder')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(item)}>
                        {t('common.remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </article>
            );
          })}
          {organizing && (
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-24 border-dashed text-muted-foreground"
              onClick={openAdd}
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
            config: body.type === 'clock' ? body.config : {},
          }).then((ok) => {
            if (ok) setDraft(null);
          });
        }}
      />
    </section>
  );
}
