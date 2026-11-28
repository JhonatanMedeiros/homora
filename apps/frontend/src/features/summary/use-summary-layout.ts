import { useCallback, useEffect, useState } from 'react';
import type { StoredSummaryLayout, SummaryChange } from '@homora/shared';
import { apiError, t } from '@/i18n';

export type SummarySave = { ok: true } | { ok: false; message: string };

/** The saved arrangement of every page, and the way to save an edit of one. */
export function useSummaryLayouts() {
  const [layouts, setLayouts] = useState<StoredSummaryLayout[] | null>(null);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/summary-layouts');
      if (!response.ok) throw new Error();
      const body: unknown = await response.json();
      if (!Array.isArray(body)) throw new TypeError();
      setLayouts(body as StoredSummaryLayout[]);
      setFailed(false);
      return body as StoredSummaryLayout[];
    } catch {
      setFailed(true);
      return null;
    }
  }, []);

  useEffect(() => {
    // Initial load synchronizes this view with the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const save = useCallback(async (pageId: number, change: SummaryChange): Promise<SummarySave> => {
    try {
      const response = await fetch(`/api/pages/${pageId}/summary-layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        // A newer arrangement is on the server: say what each choice does now.
        const conflict = (body as { code?: string } | null)?.code === 'summary-layout-conflict';
        const message = conflict
          ? t('summarygrid.conflict')
          : apiError(body, t('summarygrid.saveFailed'));
        return { ok: false, message };
      }
      const saved = body as StoredSummaryLayout;
      setLayouts((rows) => [...(rows ?? []).filter((row) => row.pageId !== pageId), saved]);
      return { ok: true };
    } catch {
      return { ok: false, message: t('summarygrid.saveFailed') };
    }
  }, []);

  return { layouts, failed, reload, save };
}
