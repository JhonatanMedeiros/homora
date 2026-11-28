import type { DatabaseSync } from 'node:sqlite';
import { MAX_PAGES, normalizePageName, type Page } from '@homora/shared';
import { createPageWidgetStore } from './page-widget-store.js';

export type PageFailure =
  | 'invalid-page-name'
  | 'page-exists'
  | 'page-limit'
  | 'page-not-found'
  | 'page-last'
  | 'page-move-required'
  | 'invalid-page-order';
type Result<T> = { ok: true; value: T } | { ok: false; code: PageFailure };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: PageFailure): Result<never> => ({ ok: false, code });

/**
 * Pages (tabs of the Home). Rules: 1 to 12 pages, names of 1 to 40 characters unique ignoring
 * case, the last page cannot be deleted, and deleting a page moves its groups (and so its
 * services) to another page. The database enforces name uniqueness too (NOCASE index).
 */
export function createPages(sqlite: DatabaseSync, nested = false) {
  const widgets = createPageWidgetStore(sqlite);
  const transaction = <T>(work: () => T): T => {
    sqlite.exec(nested ? 'SAVEPOINT page_change' : 'BEGIN IMMEDIATE');
    try {
      const result = work();
      sqlite.exec(nested ? 'RELEASE page_change' : 'COMMIT');
      return result;
    } catch (error) {
      sqlite.exec(nested ? 'ROLLBACK TO page_change; RELEASE page_change' : 'ROLLBACK');
      throw error;
    }
  };
  const list = () =>
    sqlite.prepare('SELECT id,name,position FROM pages ORDER BY position,id').all() as Page[];
  const find = (id: number) =>
    sqlite.prepare('SELECT id,name,position FROM pages WHERE id=?').get(id) as Page | undefined;
  const nameTaken = (name: string, exceptId?: number) =>
    Boolean(
      sqlite
        .prepare('SELECT id FROM pages WHERE name=? COLLATE NOCASE AND id IS NOT ?')
        .get(name, exceptId ?? null),
    );
  const bumpVersion = () =>
    sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
  const renumber = () => {
    const update = sqlite.prepare('UPDATE pages SET position=? WHERE id=?');
    list().forEach((page, position) => update.run(position, page.id));
  };

  return {
    list,
    find,
    /** The first page: where new groups go unless told otherwise. */
    firstId(): number {
      const row = sqlite.prepare('SELECT id FROM pages ORDER BY position,id LIMIT 1').get() as
        | { id: number }
        | undefined;
      if (!row) throw new Error('There is always at least one page');
      return row.id;
    },
    findByName(name: string): Page | undefined {
      return sqlite
        .prepare('SELECT id,name,position FROM pages WHERE name=? COLLATE NOCASE')
        .get(name) as Page | undefined;
    },
    /** Groups on each page, for the settings screen and for deletion warnings. */
    groupCounts(): Map<number, number> {
      const rows = sqlite
        .prepare('SELECT page_id AS id, COUNT(*) AS n FROM service_groups GROUP BY page_id')
        .all() as { id: number; n: number }[];
      return new Map(rows.map((row) => [row.id, row.n]));
    },
    /** Widgets someone added; the Summary's own are replaced by those of any other page. */
    widgetCount: widgets.countAdded,
    create(rawName: unknown): Result<Page> {
      const name = normalizePageName(rawName);
      if (!name) return fail('invalid-page-name');
      return transaction(() => {
        if (list().length >= MAX_PAGES) return fail('page-limit');
        if (nameTaken(name)) return fail('page-exists');
        const position = list().length;
        const created = sqlite
          .prepare('INSERT INTO pages(name,position) VALUES(?,?)')
          .run(name, position);
        widgets.seedSummary(Number(created.lastInsertRowid));
        bumpVersion();
        return ok(find(Number(created.lastInsertRowid))!);
      });
    },
    rename(id: number, rawName: unknown): Result<Page> {
      const name = normalizePageName(rawName);
      if (!name) return fail('invalid-page-name');
      return transaction(() => {
        if (!find(id)) return fail('page-not-found');
        if (nameTaken(name, id)) return fail('page-exists');
        sqlite.prepare('UPDATE pages SET name=? WHERE id=?').run(name, id);
        bumpVersion();
        return ok(find(id)!);
      });
    },
    /** Deletes a page. Its groups and widgets move to `moveTo`, which must then be given. */
    remove(id: number, moveTo?: number): Result<{ movedGroups: number; name: string }> {
      return transaction(() => {
        const page = find(id);
        if (!page) return fail('page-not-found');
        if (list().length <= 1) return fail('page-last');
        const groups = (
          sqlite.prepare('SELECT COUNT(*) AS n FROM service_groups WHERE page_id=?').get(id) as {
            n: number;
          }
        ).n;
        if (groups > 0 || widgets.countAdded(id) > 0) {
          if (moveTo === undefined) return fail('page-move-required');
          if (moveTo === id || !find(moveTo)) return fail('page-not-found');
          sqlite.prepare('UPDATE service_groups SET page_id=? WHERE page_id=?').run(moveTo, id);
        }
        // The destination has its own Summary: this page's goes with it.
        widgets.removeSummary(id);
        if (moveTo !== undefined) widgets.moveAll(id, moveTo);
        sqlite.prepare('DELETE FROM pages WHERE id=?').run(id);
        renumber();
        bumpVersion();
        return ok({ movedGroups: groups, name: page.name });
      });
    },
    /** `ids` must be every page exactly once, in the wanted order. */
    reorder(ids: number[]): Result<Page[]> {
      return transaction(() => {
        const current = list();
        if (
          ids.length !== current.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !current.some((page) => page.id === id))
        )
          return fail('invalid-page-order');
        const update = sqlite.prepare('UPDATE pages SET position=? WHERE id=?');
        ids.forEach((id, position) => update.run(position, id));
        bumpVersion();
        return ok(list());
      });
    },
    /** Puts a group on a page. */
    setGroupPage(groupId: number, pageId: number): Result<{ name: string; page: string }> {
      return transaction(() => {
        const page = find(pageId);
        if (!page) return fail('page-not-found');
        const group = sqlite.prepare('SELECT name FROM service_groups WHERE id=?').get(groupId) as
          | { name: string }
          | undefined;
        if (!group) return fail('page-not-found');
        sqlite.prepare('UPDATE service_groups SET page_id=? WHERE id=?').run(pageId, groupId);
        bumpVersion();
        return ok({ name: group.name, page: page.name });
      });
    },
  };
}

export type PagesStore = ReturnType<typeof createPages>;
