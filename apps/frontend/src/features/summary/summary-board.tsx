import { Plus, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  summaryKey,
  MAX_WIDGETS_PER_PAGE,
  type SummaryBlock,
  type SummaryDesktopItem,
  type SummaryLayout,
  type SummaryPhoneItem,
} from '@homora/shared';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { ExpiredToggle, usePageWidgets } from '@/components/page-widgets';
import { SectionSkeleton } from '@/components/skeletons';
import { resolveDesktop, resolvePhone, setHidden } from '@/features/summary/model';
import type { BlockView } from '@/features/summary/summary-blocks';
import { SummaryColumn, SummaryGrid, type GridEntry } from '@/features/summary/summary-grid';
import { useSummaryLayouts } from '@/features/summary/use-summary-layout';
import type { PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

type Draft = {
  pageId: number;
  phone: boolean;
  revision: number;
  /** Null stands for the default arrangement. */
  items: SummaryDesktopItem[] | SummaryPhoneItem[] | null;
};

type Props = {
  pageId: number;
  pages: PageRow[];
  groups: { name: string; pageId: number | null }[];
  /** One column, with its own order and only reordering and removing. */
  phone: boolean;
  /** The built-in blocks; null while there is no service to speak of. */
  blocks: Record<SummaryBlock, BlockView> | null;
  openMonitor: (id: number, hasService: boolean) => void;
};

/** The Summary's blocks and widgets in the arrangement saved for this page, and its editor. */
export function SummaryBoard({ pageId, pages, groups, phone, blocks, openMonitor }: Props) {
  const store = useSummaryLayouts();
  const stored = store.layouts?.find((layout) => layout.pageId === pageId) ?? null;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const customizeButton = useRef<HTMLButtonElement>(null);
  const editing = draft !== null && draft.pageId === pageId && draft.phone === phone;
  const toolbar = useRef<HTMLDivElement>(null);
  // The button that started the editor is gone: the keyboard continues from the toolbar.
  useEffect(() => {
    if (editing) toolbar.current?.focus();
  }, [editing]);

  const save = async (layout: SummaryLayout, revision: number) => {
    setSaving(true);
    const result = await store.save(pageId, revision, layout);
    setSaving(false);
    return result;
  };
  const saved = phone ? (stored?.phone ?? null) : (stored?.desktop ?? null);
  const source = editing ? draft.items : saved;
  const resolve = (items: Draft['items']) =>
    phone
      ? resolvePhone(items as SummaryPhoneItem[] | null, widgets.current)
      : resolveDesktop(items as SummaryDesktopItem[] | null, widgets.current);
  /** Removed blocks wait in the add dialog; taking one back puts it at the end. */
  const removed = (source ?? []).flatMap((item) => {
    const block = item.block;
    if (!item.hidden || block === undefined || !blocks) return [];
    const key = summaryKey(item);
    return [
      {
        key,
        title: blocks[block].title,
        onPick: () =>
          setDraft(
            (current) =>
              current && {
                ...current,
                items: setHidden(resolve(current.items) as SummaryDesktopItem[], key, false),
              },
          ),
      },
    ];
  });
  const widgets = usePageWidgets({
    pageId,
    pages,
    groups,
    layout: 'grid',
    openMonitor,
    blocks: removed,
  });

  /** Without the entries of widgets deleted or moved away since they were arranged. */
  const present = <T extends SummaryPhoneItem>(items: T[] | null) =>
    items?.filter(
      (item) =>
        item.widgetId === undefined ||
        widgets.current.some((widget) => widget.id === item.widgetId),
    ) ?? null;
  /** The saved layout with the arrangement of this kind of screen replaced. */
  const replaced = (items: Draft['items']): SummaryLayout => ({
    desktop: present(phone ? (stored?.desktop ?? null) : (items as SummaryDesktopItem[] | null)),
    phone: present(phone ? (items as SummaryPhoneItem[] | null) : (stored?.phone ?? null)),
  });

  if (store.layouts === null && !store.failed)
    return <SectionSkeleton label={t('common.loading')} />;

  const items = resolve(source);

  const byId = new Map(widgets.current.map((widget) => [widget.id, widget]));
  const change = (next: SummaryDesktopItem[] | SummaryPhoneItem[]) =>
    setDraft((current) => current && { ...current, items: next });

  const entries = items.flatMap((item): GridEntry[] => {
    if (item.hidden) return [];
    const key = summaryKey(item);
    if (item.block !== undefined) {
      const block = blocks?.[item.block];
      if (!block || (block.absent && !editing)) return [];
      return [{ key, title: block.title, node: block.node, rows: block.rows, fit: block.fit }];
    }
    const widget = byId.get(item.widgetId);
    if (!widget || (!editing && !widgets.showHidden && widgets.isExpired(widget))) return [];
    const width = 'width' in item ? (item.width as number) : 12;
    return [
      {
        key,
        title: widgets.nameOf(widget),
        node: (
          <div role="list" className="flex min-h-0 flex-1 flex-col">
            {widgets.card(widget, 0, !phone && width >= 6)}
          </div>
        ),
        widget: {
          onEdit: widget.version === 1 ? () => widgets.edit(widget) : undefined,
          onDelete: () => widgets.askRemove(widget),
        },
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
    setDraft({ pageId, phone, revision: stored?.revision ?? 0, items: saved });
  };
  const done = async () => {
    if (!draft) return;
    if (draft.items === saved) return leave();
    const result = await save(replaced(draft.items), draft.revision);
    if (result.ok) {
      toast.success(t('summarygrid.saved'));
      return leave();
    }
    // Keep the work; a further "Done" replaces what is on the server now.
    setSaveError(result.message);
    await store.reload();
  };
  const latest = stored?.revision ?? 0;
  if (editing && saveError && draft.revision !== latest) setDraft({ ...draft, revision: latest });

  // Without the saved arrangement or all the widgets, saving would forget places.
  const cannotEdit = !pageId || store.failed || widgets.loadFailed || widgets.loading;
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={button}
              disabled={widgets.full && removed.length === 0}
              onClick={widgets.openAdd}
            >
              <Plus />
              {t('summarygrid.addWidget')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={button}
              onClick={() => setDraft({ ...draft, items: null })}
            >
              {t('summarygrid.reset')}
            </Button>
            <div className="ml-auto flex gap-2">
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
      {widgets.error && (
        <p role="alert" className="text-sm text-destructive">
          {widgets.error}
        </p>
      )}
      {entries.length === 0 && !widgets.loading && blocks !== null && (
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
      {widgets.dialogs}
    </div>
  );
}
