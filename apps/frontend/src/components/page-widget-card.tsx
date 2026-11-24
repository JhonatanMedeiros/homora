import { MoreHorizontal } from 'lucide-react';
import { Button } from '@homora/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@homora/ui/dropdown-menu';
import { cn } from '@homora/ui/lib/utils';
import { CardWidgets } from '@/components/card-widgets';
import { WidgetErrorBoundary } from '@/components/widget-error-boundary';
import { WidgetHost } from '@/components/widget-host';
import { useWidgetMonitoring } from '@/hooks/use-widget-monitoring';
import { getWidgetUI } from '@/components/widget-ui-registry';
import type { WidgetDraft } from '@/components/page-widget-dialog';
import type { PageWidget } from '@/components/use-page-widget-data';
import type { Connection } from '@/features/connections/connection-model';
import type { CardWidgetState } from '@/hooks/use-card-widgets';
import type { PageRow } from '@/hooks/use-pages';
import { t, tOr } from '@/i18n';

export function PageWidgetCard({
  item,
  index,
  current,
  connections,
  readings,
  loading,
  pages,
  fullPages,
  layout,
  groups,
  openMonitor,
  showHidden,
  visibilityNow,
  dragId,
  setDragId,
  setDropAt,
  endDrag,
  dropHere,
  markable,
  reorder,
  setChosen,
  setDraft,
  setRemoving,
  change,
}: {
  item: PageWidget;
  index: number;
  current: PageWidget[];
  connections: Connection[];
  readings: Record<number, CardWidgetState>;
  loading: boolean;
  pages: PageRow[];
  fullPages: Set<number>;
  layout: 'rail' | 'strip';
  groups: { name: string; pageId: number | null }[];
  openMonitor?: (id: number, hasService: boolean) => void;
  showHidden: boolean;
  visibilityNow: Date;
  dragId: number | null;
  setDragId: (value: number | null) => void;
  setDropAt: (value: number | null) => void;
  endDrag: () => void;
  dropHere: () => void;
  markable: (slot: number) => boolean;
  reorder: (id: number, to: number) => void;
  setChosen: (value: boolean) => void;
  setDraft: (draft: WidgetDraft | null) => void;
  setRemoving: (item: PageWidget | null) => void;
  change: (url: string, method: string, body?: unknown) => Promise<boolean>;
}) {
  const ui = getWidgetUI(item.type);
  const config = item.version === 1 ? ui?.parse(item.config) : null;
  const View = ui?.View;
  const monitoring = useWidgetMonitoring(
    config != null && ui?.monitoringQuery ? ui.monitoringQuery(config) : null,
  );
  const displayName =
    item.name ||
    (ui
      ? tOr(ui.name, ui.name)
      : (connections.find((connection) => connection.id === item.connectionId)?.name ?? item.type));
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
    item.connectionId !== null &&
    !loading &&
    !connections.some((connection) => connection.id === item.connectionId);
  const state: CardWidgetState =
    item.version === 1
      ? missingConnection
        ? { ...base, status: 'unconfigured' }
        : readings[item.id]?.widget.integrationId === item.connectionId
          ? readings[item.id]!
          : { ...base, status: 'loading' }
      : { ...base, status: 'invalid' };
  const edit = () => {
    setChosen(true);
    setDraft({
      id: item.id,
      pageId: item.pageId,
      type: item.type,
      name: item.name,
      connectionId: item.connectionId,
      config: ui ? (config ?? ui.defaultConfig) : {},
      size: item.size,
    });
  };
  const movePage = (target: number) =>
    void change(`/api/page-widgets/${item.id}`, 'PUT', {
      pageId: target,
      type: item.type,
      name: item.name,
      connectionId: item.connectionId,
      config: ui ? item.config : {},
      size: item.size,
    });
  if (!showHidden && item.version === 1 && ui?.isHidden?.(item.config, visibilityNow)) return null;
  return (
    <article
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
        const sideBySide = layout === 'strip' && window.matchMedia('(min-width: 640px)').matches;
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
        layout === 'strip' && item.size === 'wide' && 'sm:col-span-2',
        current.length > 1 && 'cursor-grab active:cursor-grabbing pointer-coarse:cursor-default',
        dragId === item.id && 'border-dashed opacity-40',
      )}
    >
      {markable(index) && <DropMarker edge="start" stacked={layout === 'rail'} />}
      {index === current.length - 1 && markable(current.length) && (
        <DropMarker edge="end" stacked={layout === 'rail'} />
      )}
      <h3 className="truncate pr-24 text-sm font-medium">{displayName}</h3>
      <WidgetErrorBoundary key={`${item.type}:${item.id}`}>
        {View ? (
          config !== null && config !== undefined ? (
            <WidgetHost
              connectionReading={
                state.status === 'ready'
                  ? { status: 'ready', data: state.data, stale: !!state.stale }
                  : { status: state.status }
              }
              incidentReading={monitoring}
              wide={layout === 'strip' && item.size === 'wide'}
              groups={groups}
              pages={pages}
              openMonitor={openMonitor}
            >
              <View config={config} />
            </WidgetHost>
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
              <DropdownMenuItem disabled={index === 0} onSelect={() => reorder(item.id, index - 1)}>
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
