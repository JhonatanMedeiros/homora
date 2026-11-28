import { Plus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { resolveWidget } from '@homora/integrations';
import {
  MAX_WIDGETS_PER_PAGE,
  type SummaryDesktopItem,
  type SummaryPhoneItem,
} from '@homora/shared';
import { summaryWidgetTypes, type SummaryWidgetType } from '@homora/widgets/summary';
import { Alert, AlertDescription } from '@homora/ui/alert';
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
import { Button } from '@homora/ui/button';
import { ExpiredToggle, usePageWidgets } from '@/components/page-widgets';
import { SectionSkeleton } from '@/components/skeletons';
import type { PageWidget } from '@/components/use-page-widget-data';
import { resolveDesktop, resolvePhone } from '@/features/summary/model';
import type { BlockView } from '@/features/summary/summary-blocks';
import { SummaryColumn, SummaryGrid, type GridEntry } from '@/features/summary/summary-grid';
import { useSummaryLayouts } from '@/features/summary/use-summary-layout';
import type { PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

type Items = SummaryDesktopItem[] | SummaryPhoneItem[] | null;
type Draft = {
  pageId: number;
  phone: boolean;
  revision: number;
  /** Null stands for the default arrangement. */
  items: Items;
  /** Widgets to create, under negative ids, and to delete when the edit is saved. */
  add: PageWidget[];
  remove: number[];
};
type NewWidget = Omit<PageWidget, 'id' | 'position' | 'version'>;

const unsaved = (draft: Draft, widget: NewWidget): PageWidget => {
  const id = Math.min(0, ...draft.add.map((item) => item.id)) - 1;
  return { ...widget, id, position: Number.MAX_SAFE_INTEGER + id, version: 1 };
};

type Props = {
  pageId: number;
  pages: PageRow[];
  groups: { name: string; pageId: number | null }[];
  /** One column, with its own order and only reordering and removing. */
  phone: boolean;
  /** What the Summary's own widgets show; null while there is no service to speak of. */
  blocks: Record<SummaryWidgetType, BlockView> | null;
  openMonitor: (id: number, hasService: boolean) => void;
};

/** The widgets of a page in the arrangement saved for it, and the editor of both. */
export function SummaryBoard({ pageId, pages, groups, phone, blocks, openMonitor }: Props) {
  const store = useSummaryLayouts();
  const stored = store.layouts?.find((layout) => layout.pageId === pageId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  /** Names of configured widgets a pending save would delete, while that is being confirmed. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The widget just chosen in the gallery, to be brought into view. */
  const chosen = useRef<number | null>(null);
  const customizeButton = useRef<HTMLButtonElement>(null);
  const editing = draft !== null && draft.pageId === pageId && draft.phone === phone;
  const toolbar = useRef<HTMLDivElement>(null);
  // The button that started the editor is gone: the keyboard continues from the toolbar.
  useEffect(() => {
    if (editing) toolbar.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (chosen.current === null) return;
    const cell = document.querySelector(`[data-widget="${chosen.current}"]`);
    if (!cell) return;
    chosen.current = null;
    cell.scrollIntoView?.({ block: 'center' });
  });
  const edit = (change: (current: Draft) => Draft) =>
    setDraft((current) => current && change(current));
  const widgets = usePageWidgets({
    pageId,
    pages,
    groups,
    layout: 'grid',
    openMonitor,
    summary: true,
    edits: editing
      ? {
          add: draft.add,
          remove: draft.remove,
          onAdd: (widget) => {
            const added = unsaved(draft, widget);
            chosen.current = added.id;
            edit((current) => ({ ...current, add: [...current.add, added] }));
          },
          onDiscard: (id) =>
            edit((current) => ({ ...current, add: current.add.filter((item) => item.id !== id) })),
          onUpdate: (widget) =>
            edit((current) => ({
              ...current,
              add: current.add.map((item) => (item.id === widget.id ? widget : item)),
            })),
        }
      : undefined,
  });

  // The widgets are the page: nothing is drawn before they and their places are known.
  if (!pageId || widgets.loading || (store.layouts === null && !store.failed))
    return <SectionSkeleton label={t('common.loading')} />;

  const saved = phone ? (stored?.phone ?? null) : (stored?.desktop ?? null);
  const source = editing ? draft.items : saved;
  const items = phone
    ? resolvePhone(source as SummaryPhoneItem[] | null, widgets.current)
    : resolveDesktop(source as SummaryDesktopItem[] | null, widgets.current);
  const byId = new Map(widgets.current.map((widget) => [widget.id, widget]));
  const change = (next: SummaryDesktopItem[] | SummaryPhoneItem[]) =>
    edit((current) => ({ ...current, items: next }));
  const remove = (id: number) =>
    edit((current) =>
      id < 0
        ? { ...current, add: current.add.filter((item) => item.id !== id) }
        : { ...current, remove: [...current.remove, id] },
    );

  const entries = items.flatMap((item): GridEntry[] => {
    const widget = byId.get(item.widgetId);
    if (!widget) return [];
    const base = { id: widget.id, type: widget.type, onRemove: () => remove(widget.id) };
    if (resolveWidget(widget.type)?.summaryOnly) {
      const block = blocks?.[widget.type as SummaryWidgetType];
      if (!block || (block.absent && !editing)) return [];
      return [{ ...base, title: block.title, node: block.node, rows: block.rows, fit: block.fit }];
    }
    if (!editing && !widgets.showHidden && widgets.isExpired(widget)) return [];
    const width = 'width' in item ? (item.width as number) : 12;
    return [
      {
        ...base,
        title: widgets.nameOf(widget),
        node: (
          <div role="list" className="flex min-h-0 flex-1 flex-col">
            {widgets.card(widget, 0, !phone && width >= 6)}
          </div>
        ),
        onEdit: widget.version === 1 ? () => widgets.edit(widget) : undefined,
      },
    ];
  });

  const leave = () => {
    setDraft(null);
    setSaveError('');
    // The toolbar that held the focus is gone.
    window.setTimeout(() => customizeButton.current?.focus());
  };
  const start = () => {
    setSaveError('');
    setDraft({ pageId, phone, revision: stored?.revision ?? 0, items: saved, add: [], remove: [] });
  };
  const byIdAll = new Map(widgets.all.map((widget) => [widget.id, widget]));
  /** The default arrangement, with every widget the Summary starts with back in it. */
  const restore = () =>
    edit((current) => {
      const mine = (id: number) => resolveWidget(byIdAll.get(id)?.type ?? '')?.summaryOnly === true;
      const kept = current.remove.filter((id) => !mine(id));
      const next = { ...current, items: null, remove: kept };
      const have = new Set(
        [...widgets.current, ...current.remove.flatMap((id) => byIdAll.get(id) ?? [])].map(
          (widget) => widget.type,
        ),
      );
      for (const type of summaryWidgetTypes)
        if (!have.has(type))
          next.add = [
            ...next.add,
            unsaved(next, {
              pageId,
              type,
              name: '',
              config: {},
              connectionId: null,
              size: 'normal',
            }),
          ];
      return next;
    });
  const done = async (confirmed = false) => {
    if (!draft) return;
    if (draft.items === saved && draft.add.length === 0 && draft.remove.length === 0)
      return leave();
    /** Without the entries of widgets that are being removed or no longer exist. */
    const present = <T extends SummaryPhoneItem>(entries: T[] | null) =>
      entries?.filter((item) => byId.has(item.widgetId)) ?? null;
    // A widget someone set up cannot be added back as it was: ask before it is deleted.
    const lost = draft.remove.flatMap((id) => {
      const widget = byIdAll.get(id);
      return widget && !resolveWidget(widget.type)?.summaryOnly ? [widgets.nameOf(widget)] : [];
    });
    if (lost.length > 0 && !confirmed) return setConfirming(lost.join(', '));
    setSaving(true);
    const result = await store.save(pageId, {
      revision: draft.revision,
      desktop: present(
        phone ? (stored?.desktop ?? null) : (draft.items as SummaryDesktopItem[] | null),
      ),
      phone: present(phone ? (draft.items as SummaryPhoneItem[] | null) : (stored?.phone ?? null)),
      add: draft.add.map(({ id, type, name, config, connectionId, size }) => ({
        id,
        type,
        name,
        config,
        connectionId,
        size,
      })),
      remove: draft.remove,
    });
    if (result.ok) {
      if (draft.add.length > 0 || draft.remove.length > 0)
        await widgets.reload().catch(() => toast.error(t('pageWidgets.loadFailed')));
      setSaving(false);
      toast.success(t('summarygrid.saved'));
      return leave();
    }
    // Keep the work; a further "Done" replaces what is on the server now.
    setSaving(false);
    setSaveError(result.message);
    await Promise.all([store.reload(), widgets.reload().catch(() => {})]);
  };
  const latest = stored?.revision ?? 0;
  if (editing && saveError && draft.revision !== latest) setDraft({ ...draft, revision: latest });

  // Without the saved arrangement or all the widgets, saving would forget places.
  const cannotEdit = store.failed || widgets.loadFailed;
  const button = 'max-md:min-h-11 pointer-coarse:min-h-11';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {editing ? (
        <div
          ref={toolbar}
          tabIndex={-1}
          role="toolbar"
          aria-label={t('summarygrid.toolbar')}
          className="sticky top-0 z-20 flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={button}
              disabled={widgets.full}
              onClick={widgets.openAdd}
            >
              <Plus />
              {t('summarygrid.addWidget')}
            </Button>
            <Button type="button" variant="ghost" size="sm" className={button} onClick={restore}>
              {t('summarygrid.reset')}
            </Button>
            <div className="col-span-2 grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
              <Button type="button" variant="outline" size="sm" className={button} onClick={leave}>
                {t('summarygrid.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                className={button}
                disabled={saving}
                onClick={() => void done()}
              >
                {t('summarygrid.done')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(phone ? 'summarygrid.hint.phone' : 'summarygrid.hint.wide')}
            {widgets.full && ` ${t('pageWidgets.limit', { max: MAX_WIDGETS_PER_PAGE })}`}
          </p>
          {draft.remove.length > 0 && (
            <p className="text-xs font-medium">{t('summarygrid.pendingRemoval')}</p>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
        </div>
      ) : (
        <div className="-my-2 flex justify-end md:-mt-3 md:mb-[-0.75rem]">
          <Button
            ref={customizeButton}
            type="button"
            variant="ghost"
            size="sm"
            className={`text-muted-foreground ${button}`}
            disabled={cannotEdit}
            onClick={start}
          >
            <SlidersHorizontal />
            {t('summarygrid.customize')}
          </Button>
        </div>
      )}
      {store.failed && (
        <Alert variant="destructive">
          <AlertDescription>
            {t('summarygrid.loadFailed')}
            <Button type="button" variant="link" onClick={() => void store.reload()}>
              {t('summarygrid.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {widgets.loadFailed ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t('pageWidgets.loadFailed')}
            <Button
              type="button"
              variant="link"
              onClick={() => void widgets.reload().catch(() => {})}
            >
              {t('summarygrid.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        widgets.error && (
          <p role="alert" className="text-sm text-destructive">
            {widgets.error}
          </p>
        )
      )}
      {entries.length === 0 && !widgets.loadFailed && blocks !== null && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('summarygrid.empty')}
        </p>
      )}
      {phone ? (
        <SummaryColumn
          entries={entries}
          items={items as SummaryPhoneItem[]}
          editing={editing}
          onChange={change}
        />
      ) : (
        <SummaryGrid
          entries={entries}
          items={items as SummaryDesktopItem[]}
          widgets={widgets.current}
          editing={editing}
          onChange={change}
        />
      )}
      <ExpiredToggle widgets={widgets} />
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('summarygrid.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('summarygrid.deleteNote', { names: confirming ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('pages.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(null);
                void done(true);
              }}
            >
              {t('summarygrid.deleteAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {widgets.dialogs}
    </div>
  );
}
