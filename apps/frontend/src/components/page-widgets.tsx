import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { Button } from '@homora/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@homora/ui/alert-dialog';
import type { PageRow } from '@/hooks/use-pages';
import { PageWidgetDialog, type WidgetDraft } from '@/components/page-widget-dialog';
import { t, tOr } from '@/i18n';
import { PageWidgetCard } from '@/components/page-widget-card';
import { getWidgetUI, listWidgetUI } from '@/components/widget-ui-registry';
import { usePageWidgetData, type PageWidget } from '@/components/use-page-widget-data';

function newWidgetDraft(pageId: number): WidgetDraft {
  return {
    id: null,
    pageId,
    type: listWidgetUI()[0]![0],
    name: '',
    config: listWidgetUI()[0]![1].defaultConfig,
    connectionId: null,
    size: 'normal',
  };
}

type Options = {
  pageId: number;
  pages: PageRow[];
  /** `rail` stacks the widgets in a narrow column; `strip` spreads them; `grid` fills Summary cells. */
  layout?: 'strip' | 'rail' | 'grid';
  groups?: { name: string; pageId: number | null }[];
  openMonitor?: (id: number, hasService: boolean) => void;
  /** Offered beside "Remove" where a widget can also just be taken off the view. */
  onHide?: (id: number) => void;
};

/**
 * Everything the widgets of a page need wherever they are drawn: their data, one card each, and
 * the add, edit and remove dialogs.
 */
export function usePageWidgets({
  pageId,
  pages,
  layout = 'strip',
  groups = [],
  openMonitor,
  onHide,
}: Options) {
  const [showHidden, setShowHidden] = useState(false);
  const [visibilityNow, setVisibilityNow] = useState(() => new Date());
  const { widgets, connections, readings, error, busy, loading, loadFailed, change, reorder } =
    usePageWidgetData(pageId);
  const [draft, setDraft] = useState<WidgetDraft | null>(null);
  const [chosen, setChosen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  /** Insertion slot among the page's widgets (0 = before the first, n = after the last). */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [removing, setRemoving] = useState<PageWidget | null>(null);
  useEffect(() => {
    if (!widgets.some((widget) => getWidgetUI(widget.type)?.isHidden)) return;
    let timer: number;
    const update = () => {
      window.clearTimeout(timer);
      if (!document.hidden) {
        setVisibilityNow(new Date());
        timer = window.setTimeout(update, 60_000);
      }
    };
    timer = window.setTimeout(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [widgets]);
  const current = widgets.filter((item) => item.pageId === pageId);
  const hiddenCount = current.filter(
    (item) =>
      item.version === 1 &&
      (getWidgetUI(item.type)?.isHidden?.(item.config, visibilityNow) ?? false),
  ).length;
  const full = current.length >= MAX_WIDGETS_PER_PAGE;
  const fullPages = new Set(
    pages
      .filter(
        (page) => widgets.filter((item) => item.pageId === page.id).length >= MAX_WIDGETS_PER_PAGE,
      )
      .map((page) => page.id),
  );
  const openAdd = () => {
    setChosen(false);
    setDraft(newWidgetDraft(pageId));
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
  const isExpired = (item: PageWidget) =>
    item.version === 1 && (getWidgetUI(item.type)?.isHidden?.(item.config, visibilityNow) ?? false);
  const nameOf = (item: PageWidget) => {
    const ui = getWidgetUI(item.type);
    return item.name || (ui ? tOr(ui.name, ui.name) : item.type);
  };
  const edit = (item: PageWidget) => {
    const ui = getWidgetUI(item.type);
    setChosen(true);
    setDraft({
      id: item.id,
      pageId: item.pageId,
      type: item.type,
      name: item.name,
      connectionId: item.connectionId,
      config: ui ? ((item.version === 1 ? ui.parse(item.config) : null) ?? ui.defaultConfig) : {},
      size: item.size,
    });
  };
  /** One card. In the grid the Summary owns the order, so the card neither drags nor reorders. */
  const card = (item: PageWidget, index: number, wide?: boolean) => (
    <PageWidgetCard
      key={item.id}
      {...{
        item,
        connections,
        readings,
        loading,
        pages,
        fullPages,
        layout,
        wide,
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
      }}
      index={layout === 'grid' ? 0 : index}
      current={layout === 'grid' ? [item] : current}
    />
  );
  const remove = (item: PageWidget) => void change(`/api/page-widgets/${item.id}`, 'DELETE');
  const dialogs = (
    <>
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
            {onHide && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (removing) onHide(removing.id);
                  setRemoving(null);
                }}
              >
                {t('summarygrid.hide')}
              </Button>
            )}
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (removing) remove(removing);
                setRemoving(null);
              }}
            >
              {t('common.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageWidgetDialog
        groups={groups}
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
            config: getWidgetUI(body.type) ? body.config : {},
          }).then((ok) => {
            if (ok) setDraft(null);
          });
        }}
      />
    </>
  );
  return {
    current,
    loading,
    loadFailed,
    error: draft ? '' : error,
    full,
    openAdd,
    card,
    dialogs,
    isExpired,
    nameOf,
    edit,
    askRemove: setRemoving,
    hiddenCount,
    showHidden,
    toggleHidden: () => setShowHidden((value) => !value),
    dragId,
    setDropAt,
    dropHere,
  };
}

/** The button that reveals widgets that chose to hide themselves, such as finished countdowns. */
export function ExpiredToggle({ widgets }: { widgets: ReturnType<typeof usePageWidgets> }) {
  if (widgets.hiddenCount === 0) return null;
  return (
    <Button type="button" variant="ghost" className="self-start" onClick={widgets.toggleHidden}>
      {widgets.showHidden
        ? t('pageWidgets.hideExpired')
        : t('pageWidgets.showExpired', { count: widgets.hiddenCount })}
    </Button>
  );
}

type Props = Omit<Options, 'onHide' | 'layout'> & {
  layout?: 'strip' | 'rail';
  /** The "Add widget" tile; phones show it only while organizing. */
  showAdd?: boolean;
};

/** Widgets of a page. Plain information by default; the controls appear in the card menu. */
export function PageWidgets({ showAdd = true, ...options }: Props) {
  const widgets = usePageWidgets(options);
  if (!options.pageId) return null;
  return (
    <>
      <PageWidgetList widgets={widgets} layout={options.layout} showAdd={showAdd} />
      {widgets.dialogs}
    </>
  );
}

/**
 * The cards of a page from a controller the caller keeps, so they can move around the view without
 * reading everything again. The caller renders `widgets.dialogs` somewhere that stays mounted.
 */
export function PageWidgetList({
  widgets,
  layout = 'strip',
  showAdd = true,
}: {
  widgets: ReturnType<typeof usePageWidgets>;
  layout?: 'strip' | 'rail';
  showAdd?: boolean;
}) {
  const { current, loading, error, full, openAdd, dragId, setDropAt, dropHere } = widgets;
  return (
    <section aria-label={t('pageWidgets.title')} className="flex flex-col gap-3">
      {error && (
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
          className={
            layout === 'rail' ? 'flex flex-col gap-3' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
          }
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);
          }}
        >
          <div role={current.length > 0 ? 'list' : undefined} className="contents">
            {current.map((item, index) => widgets.card(item, index))}
          </div>
          {full ? (
            <p className="flex min-h-24 items-center justify-center rounded-md border border-dashed p-3 text-center text-sm text-muted-foreground">
              {t('pageWidgets.limit', { max: MAX_WIDGETS_PER_PAGE })}
            </p>
          ) : showAdd ? (
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
          ) : null}
        </div>
      )}
      <ExpiredToggle widgets={widgets} />
    </section>
  );
}
