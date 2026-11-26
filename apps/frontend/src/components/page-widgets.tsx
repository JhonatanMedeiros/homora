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
import { t } from '@/i18n';
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

type Props = {
  pageId: number;
  pages: PageRow[];
  /** `rail` stacks the widgets in a narrow column beside the services; `strip` spreads them above. */
  layout?: 'strip' | 'rail';
  groups?: { name: string; pageId: number | null }[];
  openMonitor?: (id: number, hasService: boolean) => void;
  /** The "Add widget" tile; phones show it only while organizing. */
  showAdd?: boolean;
};

/** Widgets of a page. Plain information by default; the controls appear in the card menu and organize mode. */
export function PageWidgets({
  pageId,
  pages,
  layout = 'strip',
  groups = [],
  openMonitor,
  showAdd = true,
}: Props) {
  const [showHidden, setShowHidden] = useState(false);
  const [visibilityNow, setVisibilityNow] = useState(() => new Date());
  const { widgets, connections, readings, error, busy, loading, change, reorder } =
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
  const hiddenCount = current.filter((item) => {
    return (
      item.version === 1 &&
      (getWidgetUI(item.type)?.isHidden?.(item.config, visibilityNow) ?? false)
    );
  }).length;
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
          className={
            layout === 'rail' ? 'flex flex-col gap-3' : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
          }
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);
          }}
        >
          <div role={current.length > 0 ? 'list' : undefined} className="contents">
            {current.map((item, index) => (
              <PageWidgetCard
                key={item.id}
                {...{
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
                }}
              />
            ))}
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
      {hiddenCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => setShowHidden(!showHidden)}
        >
          {showHidden
            ? t('pageWidgets.hideExpired')
            : t('pageWidgets.showExpired', { count: hiddenCount })}
        </Button>
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
    </section>
  );
}
