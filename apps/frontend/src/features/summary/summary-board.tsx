import { SlidersHorizontal } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { resolveWidget } from '@homora/integrations';
import type { SummaryDesktopItem, SummaryPhoneItem } from '@homora/shared';
import { Alert, AlertDescription } from '@homora/ui/alert';
import { Button } from '@homora/ui/button';
import { ExpiredToggle, usePageWidgets } from '@/components/page-widgets';
import { SectionSkeleton } from '@/components/skeletons';
import {
  isUnchanged,
  lostSettings,
  restoreDefault,
  savedItems,
  startDraft,
  toChange,
} from '@/features/summary/draft';
import { resolveDesktop, resolvePhone } from '@/features/summary/model';
import type { SummaryContent } from '@/features/summary/summary-content';
import { SummaryColumn, SummaryGrid, type GridEntry } from '@/features/summary/summary-grid';
import {
  ConfirmDeletion,
  SummaryToolbar,
  TOOLBAR_BUTTON,
} from '@/features/summary/summary-toolbar';
import { useSummaryDraft } from '@/features/summary/use-summary-draft';
import { useSummaryLayouts } from '@/features/summary/use-summary-layout';
import type { PageRow } from '@/hooks/use-pages';
import { t } from '@/i18n';

type Props = {
  pageId: number;
  pages: PageRow[];
  groups: { name: string; pageId: number | null }[];
  /** One column, with its own order and only reordering, removing and adding. */
  phone: boolean;
  /** What the Summary's own widgets show; null while there is no service to speak of. */
  content: SummaryContent | null;
  openMonitor: (id: number, hasService: boolean) => void;
};

/** The widgets of a page in the arrangement saved for it, and the editor of both. */
export function SummaryBoard({ pageId, pages, groups, phone, content, openMonitor }: Props) {
  const store = useSummaryLayouts();
  const stored = store.layouts?.find((layout) => layout.pageId === pageId) ?? null;
  const editor = useSummaryDraft(pageId, phone);
  const draft = editor.current;
  const editing = draft !== null;
  const customizeButton = useRef<HTMLButtonElement>(null);
  const widgets = usePageWidgets({
    pageId,
    pages,
    groups,
    layout: 'grid',
    openMonitor,
    summary: true,
    edits: editor.widgetEdits,
  });

  // The widgets are the page: nothing is drawn before they and their places are known.
  if (!pageId || widgets.loading || (store.layouts === null && !store.failed))
    return <SectionSkeleton label={t('common.loading')} />;

  const source = draft ? draft.items : savedItems(stored, phone);
  const items = phone
    ? resolvePhone(source as SummaryPhoneItem[] | null, widgets.current)
    : resolveDesktop(source as SummaryDesktopItem[] | null, widgets.current);
  const byId = new Map(widgets.current.map((widget) => [widget.id, widget]));
  const onPage = widgets.all.filter((widget) => widget.pageId === pageId);

  const entries = items.flatMap((item): GridEntry[] => {
    const widget = byId.get(item.widgetId);
    if (!widget) return [];
    const base = { id: widget.id, type: widget.type, onRemove: () => editor.remove(widget.id) };
    const edit = widget.version === 1 ? () => widgets.edit(widget) : undefined;
    if (resolveWidget(widget.type)?.summaryOnly) {
      const view = content?.(widget);
      if (!view || (view.absent && !editing)) return [];
      const { title, node, rows, fit } = view;
      return [
        {
          ...base,
          title,
          node,
          rows,
          fit,
          onEdit: widgets.hasOptions(widget) ? edit : undefined,
        },
      ];
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
        onEdit: edit,
      },
    ];
  });

  const leave = () => {
    editor.leave();
    // The toolbar that held the focus is gone.
    window.setTimeout(() => customizeButton.current?.focus());
  };
  const done = async (confirmed = false) => {
    if (!draft) return;
    if (isUnchanged(draft, stored)) return leave();
    // A widget someone set up cannot be added back as it was: ask before it is deleted.
    const lost = lostSettings(draft, onPage).map(widgets.nameOf);
    if (lost.length > 0 && !confirmed) return editor.setConfirming(lost.join(', '));
    editor.setSaving(true);
    const result = await store.save(pageId, toChange(draft, stored, new Set(byId.keys())));
    if (result.ok) {
      if (draft.add.length > 0 || draft.remove.length > 0)
        await widgets.reload().catch(() => toast.error(t('pageWidgets.loadFailed')));
      toast.success(t('summarygrid.saved'));
      return leave();
    }
    // Keep the work; a further "Done" replaces what is on the server now.
    editor.setSaving(false);
    editor.setError(result.message);
    const [layouts] = await Promise.all([store.reload(), widgets.reload().catch(() => {})]);
    if (layouts) {
      const revision = layouts.find((layout) => layout.pageId === pageId)?.revision ?? 0;
      editor.edit((current) => ({ ...current, revision }));
    }
  };

  // Without the saved arrangement or all the widgets, saving would forget places.
  const cannotEdit = store.failed || widgets.loadFailed;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {draft ? (
        <SummaryToolbar
          phone={phone}
          full={widgets.full}
          saving={editor.saving}
          removing={draft.remove.length > 0}
          error={editor.error}
          onAdd={widgets.openAdd}
          onRestore={() => editor.edit((current) => restoreDefault(current, onPage))}
          onCancel={leave}
          onDone={() => void done()}
        />
      ) : (
        <div className="-my-2 flex justify-end md:-mt-3 md:mb-[-0.75rem]">
          <Button
            ref={customizeButton}
            type="button"
            variant="ghost"
            size="sm"
            className={`text-muted-foreground ${TOOLBAR_BUTTON}`}
            disabled={cannotEdit}
            onClick={() => editor.start(startDraft(pageId, phone, stored))}
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
      {entries.length === 0 && !widgets.loadFailed && content !== null && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t('summarygrid.empty')}
        </p>
      )}
      {phone ? (
        <SummaryColumn
          entries={entries}
          items={items as SummaryPhoneItem[]}
          editing={editing}
          onChange={editor.arrange}
        />
      ) : (
        <SummaryGrid
          entries={entries}
          items={items as SummaryDesktopItem[]}
          widgets={widgets.current}
          editing={editing}
          onChange={editor.arrange}
        />
      )}
      <ExpiredToggle widgets={widgets} />
      <ConfirmDeletion
        names={editor.confirming}
        onCancel={() => editor.setConfirming(null)}
        onConfirm={() => {
          editor.setConfirming(null);
          void done(true);
        }}
      />
      {widgets.dialogs}
    </div>
  );
}
