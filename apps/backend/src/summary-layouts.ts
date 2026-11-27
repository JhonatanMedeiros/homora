import type { DatabaseSync } from 'node:sqlite';
import {
  isSummaryBlock,
  parseSummaryLayout,
  type StoredSummaryLayout,
  type SummaryDesktopItem,
  type SummaryLayout,
  type SummaryPhoneItem,
  type SummaryRef,
} from '@homora/shared';

type ItemRow = {
  pageId: number;
  device: string;
  block: string | null;
  widgetId: number | null;
  width: number | null;
  height: number | null;
  hidden: number;
};

export type SummarySaveResult =
  | { ok: true; layout: StoredSummaryLayout }
  | { ok: false; code: 'page-not-found' | 'invalid-summary-layout' | 'summary-layout-conflict' };

/** Reads and writes the customized Summary of each page. */
export function createSummaryLayouts(sqlite: DatabaseSync) {
  const items = () =>
    sqlite
      .prepare(
        'SELECT page_id AS pageId,device,block,widget_id AS widgetId,width,height,hidden FROM summary_layout_items ORDER BY page_id,device,position,id',
      )
      .all() as ItemRow[];
  const refOf = (row: ItemRow): SummaryRef | null =>
    row.widgetId === null
      ? isSummaryBlock(row.block)
        ? { block: row.block }
        : null
      : // A block saved by a newer version is left out instead of breaking the page.
        { widgetId: row.widgetId };

  function list(): StoredSummaryLayout[] {
    const rows = items();
    return (
      sqlite
        .prepare('SELECT page_id AS pageId,revision FROM summary_layouts ORDER BY page_id')
        .all() as { pageId: number; revision: number }[]
    ).map(({ pageId, revision }) => {
      const desktop: SummaryDesktopItem[] = [];
      const phone: SummaryPhoneItem[] = [];
      for (const row of rows) {
        const ref = row.pageId === pageId ? refOf(row) : null;
        if (!ref) continue;
        const hidden = row.hidden === 1;
        if (row.device === 'phone') phone.push({ ...ref, hidden });
        else if (row.width !== null && row.height !== null)
          desktop.push({ ...ref, width: row.width, height: row.height, hidden });
      }
      return {
        pageId,
        revision,
        desktop: desktop.length > 0 ? desktop : null,
        phone: phone.length > 0 ? phone : null,
      };
    });
  }

  /** Items of a layout that name a widget of this page; blocks always belong. */
  const onPage = (pageId: number, layout: SummaryLayout) => {
    const ids = new Set(
      (
        sqlite.prepare('SELECT id FROM page_widgets WHERE page_id=?').all(pageId) as {
          id: number;
        }[]
      ).map((row) => row.id),
    );
    return [...(layout.desktop ?? []), ...(layout.phone ?? [])].every(
      (item) => item.widgetId === undefined || ids.has(item.widgetId),
    );
  };

  /** Replaces a page's layout. Must run inside the caller's transaction. */
  function write(pageId: number, layout: SummaryLayout) {
    sqlite
      .prepare(
        'INSERT INTO summary_layouts(page_id,revision) VALUES(?,1) ON CONFLICT(page_id) DO UPDATE SET revision=revision+1',
      )
      .run(pageId);
    sqlite.prepare('DELETE FROM summary_layout_items WHERE page_id=?').run(pageId);
    const insert = sqlite.prepare(
      'INSERT INTO summary_layout_items(page_id,device,block,widget_id,position,width,height,hidden) VALUES(?,?,?,?,?,?,?,?)',
    );
    layout.desktop?.forEach((item, position) =>
      insert.run(
        pageId,
        'desktop',
        item.block ?? null,
        item.widgetId ?? null,
        position,
        item.width,
        item.height,
        item.hidden ? 1 : 0,
      ),
    );
    layout.phone?.forEach((item, position) =>
      insert.run(
        pageId,
        'phone',
        item.block ?? null,
        item.widgetId ?? null,
        position,
        null,
        null,
        item.hidden ? 1 : 0,
      ),
    );
  }

  /** Saves a layout edited from `revision` (0 for a page never customized). */
  function save(pageId: number, revision: number, raw: unknown): SummarySaveResult {
    const layout = parseSummaryLayout(raw);
    if (!layout) return { ok: false, code: 'invalid-summary-layout' };
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const fail = (code: Extract<SummarySaveResult, { ok: false }>['code']) => {
        sqlite.exec('ROLLBACK');
        return { ok: false as const, code };
      };
      if (!sqlite.prepare('SELECT id FROM pages WHERE id=?').get(pageId))
        return fail('page-not-found');
      const current = sqlite
        .prepare('SELECT revision FROM summary_layouts WHERE page_id=?')
        .get(pageId) as { revision: number } | undefined;
      if ((current?.revision ?? 0) !== revision) return fail('summary-layout-conflict');
      if (!onPage(pageId, layout)) return fail('invalid-summary-layout');
      write(pageId, layout);
      sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
    return { ok: true, layout: list().find((entry) => entry.pageId === pageId)! };
  }

  return { list, save, write };
}
