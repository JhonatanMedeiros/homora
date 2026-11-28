import type { DatabaseSync } from 'node:sqlite';
import { resolveWidget } from '@homora/integrations';
import {
  MAX_PAGE_WIDGETS,
  MAX_WIDGETS_PER_PAGE,
  parseSummaryLayout,
  SUMMARY_MAX_ITEMS,
  type StoredSummaryLayout,
  type SummaryDesktopItem,
  type SummaryLayout,
  type SummaryPhoneItem,
} from '@homora/shared';
import { summaryPlacement } from '@homora/widgets';
import { checkPageWidget, type PageWidgetValue } from './page-widget-validation.js';

type ItemRow = {
  pageId: number;
  device: string;
  widgetId: number;
  width: number | null;
  height: number | null;
};

type Failure =
  | 'page-not-found'
  | 'invalid-summary-layout'
  | 'summary-layout-conflict'
  | 'widget-limit';
export type SummarySaveResult =
  | { ok: true; layout: StoredSummaryLayout }
  | { ok: false; code: Failure };

export type SummaryEdit = {
  revision: number;
  desktop: unknown;
  phone: unknown;
  add?: ({ id: number } & Record<string, unknown>)[];
  remove?: number[];
};

/** Reads the Summary of each page and saves one edit of it at a time. */
export function createSummaryLayouts(sqlite: DatabaseSync) {
  const items = () =>
    sqlite
      .prepare(
        'SELECT page_id AS pageId,device,widget_id AS widgetId,width,height FROM summary_layout_items ORDER BY page_id,device,position,id',
      )
      .all() as ItemRow[];

  function list(): StoredSummaryLayout[] {
    const rows = items();
    return (
      sqlite
        .prepare('SELECT page_id AS pageId,revision FROM summary_layouts ORDER BY page_id')
        .all() as { pageId: number; revision: number }[]
    ).map(({ pageId, revision }) => {
      const desktop: SummaryDesktopItem[] = [];
      const phone: SummaryPhoneItem[] = [];
      for (const { pageId: page, device, widgetId, width, height } of rows) {
        if (page !== pageId) continue;
        if (device === 'phone') phone.push({ widgetId });
        else if (width !== null && height !== null) desktop.push({ widgetId, width, height });
      }
      return {
        pageId,
        revision,
        desktop: desktop.length > 0 ? desktop : null,
        phone: phone.length > 0 ? phone : null,
      };
    });
  }

  /** Replaces a page's arrangement. Must run inside the caller's transaction. */
  function write(pageId: number, layout: SummaryLayout) {
    sqlite
      .prepare(
        'INSERT INTO summary_layouts(page_id,revision) VALUES(?,1) ON CONFLICT(page_id) DO UPDATE SET revision=revision+1',
      )
      .run(pageId);
    sqlite.prepare('DELETE FROM summary_layout_items WHERE page_id=?').run(pageId);
    const insert = sqlite.prepare(
      'INSERT INTO summary_layout_items(page_id,device,widget_id,position,width,height) VALUES(?,?,?,?,?,?)',
    );
    layout.desktop?.forEach((item, position) =>
      insert.run(pageId, 'desktop', item.widgetId, position, item.width, item.height),
    );
    layout.phone?.forEach((item, position) =>
      insert.run(pageId, 'phone', item.widgetId, position, null, null),
    );
  }

  const widgetsOf = (pageId: number) =>
    sqlite.prepare('SELECT id,type,size FROM page_widgets WHERE page_id=?').all(pageId) as {
      id: number;
      type: string;
      size: string;
    }[];

  /**
   * Saves one edit made from `revision` (0 for a page never customized): removes widgets, creates
   * the new ones and stores the arrangement, all or nothing.
   */
  function save(pageId: number, edit: SummaryEdit): SummarySaveResult {
    const layout = parseSummaryLayout({ desktop: edit.desktop, phone: edit.phone });
    const add = edit.add ?? [];
    const remove = edit.remove ?? [];
    const names = new Set(add.map((widget) => widget.id));
    if (
      !layout ||
      add.length > SUMMARY_MAX_ITEMS ||
      names.size !== add.length ||
      add.some((widget) => !Number.isInteger(widget.id) || widget.id >= 0)
    )
      return { ok: false, code: 'invalid-summary-layout' };
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const fail = (code: Failure) => {
        sqlite.exec('ROLLBACK');
        return { ok: false as const, code };
      };
      if (!sqlite.prepare('SELECT id FROM pages WHERE id=?').get(pageId))
        return fail('page-not-found');
      const current = sqlite
        .prepare('SELECT revision FROM summary_layouts WHERE page_id=?')
        .get(pageId) as { revision: number } | undefined;
      if ((current?.revision ?? 0) !== edit.revision) return fail('summary-layout-conflict');

      // Only this page's widgets go; one already deleted or moved away is left as it is.
      const drop = sqlite.prepare('DELETE FROM page_widgets WHERE id=? AND page_id=?');
      for (const id of remove) drop.run(id, pageId);

      const values: { name: number; value: PageWidgetValue }[] = [];
      for (const { id, ...body } of add) {
        const checked = checkPageWidget(sqlite, { ...body, pageId });
        if (!checked.ok) return fail('invalid-summary-layout');
        values.push({ name: id, value: checked.value });
      }
      const total = sqlite.prepare('SELECT COUNT(*) AS n FROM page_widgets').get() as { n: number };
      if (
        values.length > 0 &&
        (widgetsOf(pageId).length + values.length > MAX_WIDGETS_PER_PAGE ||
          total.n + values.length > MAX_PAGE_WIDGETS)
      )
        return fail('widget-limit');
      const insert = sqlite.prepare(
        'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,?,?,1,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM page_widgets WHERE page_id=?))',
      );
      const created = new Map<number, number>();
      for (const { name, value } of values)
        created.set(
          name,
          Number(
            insert.run(
              pageId,
              value.type,
              value.name,
              JSON.stringify(value.config),
              value.connectionId,
              value.size,
              pageId,
            ).lastInsertRowid,
          ),
        );

      const here = new Map(widgetsOf(pageId).map((row) => [row.id, row]));
      const exists = sqlite.prepare('SELECT 1 FROM page_widgets WHERE id=?');
      let invalid = false;
      /** Entries with real ids; those of widgets that no longer exist are dropped. */
      const settle = <T extends SummaryPhoneItem>(entries: T[] | null) =>
        entries?.flatMap((entry) => {
          const id = entry.widgetId < 0 ? created.get(entry.widgetId) : entry.widgetId;
          if (id !== undefined && here.has(id)) return [{ ...entry, widgetId: id }];
          // A new widget nobody described, or one that lives on another page.
          if (id === undefined || exists.get(id)) invalid = true;
          return [];
        }) ?? null;
      const settled: SummaryLayout = {
        desktop: settle(layout.desktop),
        phone: settle(layout.phone),
      };
      const tooSmall = settled.desktop?.some((entry) => {
        const widget = here.get(entry.widgetId)!;
        const least = summaryPlacement(
          resolveWidget(widget.type),
          widget.size === 'wide' ? 'wide' : 'normal',
        );
        return entry.width < least.minWidth || entry.height < least.minHeight;
      });
      if (invalid || tooSmall) return fail('invalid-summary-layout');
      write(pageId, settled);
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
