import type { DatabaseSync } from 'node:sqlite';
import { MAX_PAGE_WIDGETS, MAX_WIDGETS_PER_PAGE } from '@homora/shared';
import { summaryWidgetTypes } from '@homora/widgets/summary';
import type { PageWidgetValue } from './page-widget-validation.js';

export type PageWidgetRow = {
  id: number;
  pageId: number;
  type: string;
  name: string;
  /** Stored JSON text. */
  config: string;
  version: number;
  connectionId: number | null;
  size: string;
  position: number;
};

/** The Summary widget types as an SQL list; they are constants of the application. */
export const SUMMARY_TYPES_SQL = summaryWidgetTypes.map((type) => `'${type}'`).join(',');

const SELECT =
  'SELECT id,page_id AS pageId,type,name,config,version,connection_id AS connectionId,size,position FROM page_widgets';

/**
 * The only writer of page widgets: the limits and the order of each page are kept here. Values must
 * already be validated, and every write belongs to the caller's transaction.
 */
export function createPageWidgetStore(sqlite: DatabaseSync) {
  const list = (pageId?: number) =>
    (pageId === undefined
      ? sqlite.prepare(`${SELECT} ORDER BY page_id,position,id`).all()
      : sqlite
          .prepare(`${SELECT} WHERE page_id=? ORDER BY position,id`)
          .all(pageId)) as PageWidgetRow[];
  const find = (id: number) =>
    sqlite.prepare(`${SELECT} WHERE id=?`).get(id) as PageWidgetRow | undefined;
  const count = (pageId?: number) =>
    (
      (pageId === undefined
        ? sqlite.prepare('SELECT COUNT(*) AS n FROM page_widgets').get()
        : sqlite.prepare('SELECT COUNT(*) AS n FROM page_widgets WHERE page_id=?').get(pageId)) as {
        n: number;
      }
    ).n;
  /** Widgets someone added; the Summary's own are replaced by those of any other page. */
  const countAdded = (pageId: number) =>
    (
      sqlite
        .prepare(
          `SELECT COUNT(*) AS n FROM page_widgets WHERE page_id=? AND type NOT IN (${SUMMARY_TYPES_SQL})`,
        )
        .get(pageId) as { n: number }
    ).n;
  const idsOf = (pageId: number) => list(pageId).map((row) => row.id);
  const nextPosition = (pageId: number) =>
    (
      sqlite
        .prepare('SELECT COALESCE(MAX(position),-1)+1 AS n FROM page_widgets WHERE page_id=?')
        .get(pageId) as { n: number }
    ).n;
  /** Numbers a page's widgets in the given order. */
  const arrange = (ids: number[]) => {
    const update = sqlite.prepare('UPDATE page_widgets SET position=? WHERE id=?');
    ids.forEach((id, position) => update.run(position, id));
  };

  const pageHasRoom = (pageId: number, adding = 1) =>
    count(pageId) + adding <= MAX_WIDGETS_PER_PAGE;
  /** Whether new widgets fit both the page and the installation. */
  const hasRoom = (pageId: number, adding = 1) =>
    pageHasRoom(pageId, adding) && count() + adding <= MAX_PAGE_WIDGETS;

  /** Creates a widget at the end of its page, or at `position`. */
  const insert = (value: PageWidgetValue, position?: number) => {
    const siblings = position === undefined ? [] : idsOf(value.pageId);
    const id = Number(
      sqlite
        .prepare(
          'INSERT INTO page_widgets(page_id,type,name,config,version,connection_id,size,position) VALUES(?,?,?,?,1,?,?,?)',
        )
        .run(
          value.pageId,
          value.type,
          value.name,
          JSON.stringify(value.config),
          value.connectionId,
          value.size,
          position ?? nextPosition(value.pageId),
        ).lastInsertRowid,
    );
    if (position !== undefined) {
      siblings.splice(position, 0, id);
      arrange(siblings);
    }
    return id;
  };

  /** Replaces a widget. One that changes page goes to the end of the new one. */
  const update = (current: PageWidgetRow, value: PageWidgetValue) => {
    const position =
      current.pageId === value.pageId ? current.position : nextPosition(value.pageId);
    sqlite
      .prepare(
        'UPDATE page_widgets SET page_id=?,type=?,name=?,config=?,version=1,connection_id=?,size=?,position=? WHERE id=?',
      )
      .run(
        value.pageId,
        value.type,
        value.name,
        JSON.stringify(value.config),
        value.connectionId,
        value.size,
        position,
        current.id,
      );
  };

  /** Moves a widget to a place on a page, renumbering the pages it leaves and enters. */
  const move = (current: PageWidgetRow, pageId: number, position: number) => {
    const destination = idsOf(pageId).filter((id) => id !== current.id);
    destination.splice(position, 0, current.id);
    sqlite.prepare('UPDATE page_widgets SET page_id=? WHERE id=?').run(pageId, current.id);
    if (current.pageId !== pageId) arrange(idsOf(current.pageId));
    arrange(destination);
  };

  /** Deletes a widget; with `pageId`, only if it is on that page. */
  const remove = (id: number, pageId?: number) => {
    const current = find(id);
    if (!current || (pageId !== undefined && current.pageId !== pageId)) return false;
    sqlite.prepare('DELETE FROM page_widgets WHERE id=?').run(id);
    arrange(idsOf(current.pageId));
    return true;
  };

  /** Gives a page the widgets its Summary starts with. */
  const seedSummary = (pageId: number) => {
    for (const type of summaryWidgetTypes)
      insert({ pageId, type, name: '', config: {}, connectionId: null, size: 'normal' });
  };
  const removeSummary = (pageId: number) => {
    sqlite
      .prepare(`DELETE FROM page_widgets WHERE page_id=? AND type IN (${SUMMARY_TYPES_SQL})`)
      .run(pageId);
  };
  /** Sends every widget of a page to the end of another, keeping their order. */
  const moveAll = (from: number, to: number) => {
    const ids = [...idsOf(to), ...idsOf(from)];
    sqlite.prepare('UPDATE page_widgets SET page_id=? WHERE page_id=?').run(to, from);
    arrange(ids);
  };

  return {
    list,
    find,
    count,
    countAdded,
    idsOf,
    pageHasRoom,
    hasRoom,
    insert,
    update,
    arrange,
    move,
    remove,
    seedSummary,
    removeSummary,
    moveAll,
  };
}
