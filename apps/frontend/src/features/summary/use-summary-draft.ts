import { useEffect, useRef, useState } from 'react';
import type { SummaryDesktopItem, SummaryPhoneItem } from '@homora/shared';
import type { PageWidget } from '@/components/use-page-widget-data';
import {
  addWidget,
  newWidget,
  removeWidget,
  updateWidget,
  type Draft,
  type NewWidget,
} from '@/features/summary/draft';

/**
 * Holds the unsaved edit of one page and one kind of screen, and what the person is being told
 * about saving it. The rules of the edit are in `draft.ts`.
 */
export function useSummaryDraft(pageId: number, phone: boolean) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  /** Widgets whose settings a pending save would delete, while that is being confirmed. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The widget just chosen in the gallery, to be brought into view. */
  const chosen = useRef<number | null>(null);
  const current = draft && draft.pageId === pageId && draft.phone === phone ? draft : null;

  useEffect(() => {
    if (chosen.current === null) return;
    const cell = document.querySelector(`[data-widget="${chosen.current}"]`);
    if (!cell) return;
    chosen.current = null;
    cell.scrollIntoView?.({ block: 'center' });
  });

  const edit = (change: (draft: Draft) => Draft) => setDraft((value) => value && change(value));

  return {
    current,
    saving,
    setSaving,
    error,
    setError,
    confirming,
    setConfirming,
    edit,
    start: (next: Draft) => {
      setError('');
      setDraft(next);
    },
    leave: () => {
      setDraft(null);
      setError('');
      setSaving(false);
    },
    arrange: (items: SummaryDesktopItem[] | SummaryPhoneItem[]) =>
      edit((value) => ({ ...value, items })),
    remove: (id: number) => edit((value) => removeWidget(value, id)),
    /** How the widget dialog writes into the edit instead of saving at once. */
    widgetEdits: current
      ? {
          add: current.add,
          remove: current.remove,
          onAdd: (widget: NewWidget) => {
            const added = newWidget(current, widget);
            chosen.current = added.id;
            edit((value) => addWidget(value, added));
          },
          onUpdate: (widget: PageWidget) => edit((value) => updateWidget(value, widget)),
          onDiscard: (id: number) => edit((value) => removeWidget(value, id)),
        }
      : undefined,
  };
}
