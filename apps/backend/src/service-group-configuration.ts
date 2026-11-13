import type { DatabaseSync } from 'node:sqlite';
import { renumberGroups } from './group-order.js';
import { MAX_GROUP_COLUMNS } from './group-limits.js';

type Group = {
  id: number;
  name: string;
  position: number;
  columns: number | null;
  pageId: number | null;
};
type Transaction = <T>(work: () => T) => T;

/** Owns group persistence, page assignment, ordering, and their configuration side effects. */
export function createServiceGroupConfiguration(
  sqlite: DatabaseSync,
  { transaction, bumpVersion }: { transaction: Transaction; bumpVersion: () => unknown },
) {
  // A group with no page (never expected after the migration) counts as being on the first page.
  const selectGroups = () =>
    sqlite
      .prepare(
        'SELECT id,name,position,columns,COALESCE(page_id,(SELECT id FROM pages ORDER BY position,id LIMIT 1)) as pageId FROM service_groups ORDER BY position,name',
      )
      .all() as Group[];
  const firstPageId = () =>
    (sqlite.prepare('SELECT id FROM pages ORDER BY position,id LIMIT 1').get() as { id: number })
      .id;
  /** Creates the group when it is new, on `pageId` (the first page by default). */
  const ensureGroup = (name: string, columns: number | null = null, pageId?: number) => {
    const exists = sqlite.prepare('SELECT id FROM service_groups WHERE name=?').get(name);
    if (exists) return;
    const next = sqlite
      .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM service_groups')
      .get() as { position: number };
    sqlite
      .prepare('INSERT INTO service_groups(name,position,columns,page_id) VALUES(?,?,?,?)')
      .run(name, next.position, columns, pageId ?? firstPageId());
  };
  const pageIdByName = (name: string) =>
    (
      sqlite.prepare('SELECT id FROM pages WHERE name=? COLLATE NOCASE').get(name) as
        { id: number } | undefined
    )?.id;
  /** Page a group is on, by group name; `undefined` when there is no such group. */
  const pageOfGroup = (name: string) =>
    (
      sqlite
        .prepare(
          'SELECT COALESCE(page_id,(SELECT id FROM pages ORDER BY position,id LIMIT 1)) as id FROM service_groups WHERE name=?',
        )
        .get(name) as { id: number } | undefined
    )?.id;
  /** New groups can choose a page; existing groups remain on their current page. */
  function pageForNewService(category: string, page?: string): number | undefined {
    const wanted = page === undefined ? undefined : pageIdByName(page);
    if (page !== undefined && wanted === undefined) throw new Error('Page not found');
    const current = pageOfGroup(category);
    if (current !== undefined && wanted !== undefined && current !== wanted)
      throw new Error('Group is on another page');
    return wanted;
  }

  return {
    selectGroups,
    firstPageId,
    ensureGroup,
    pageIdByName,
    pageOfGroup,
    pageForNewService,
    createGroup(name: string, pageId?: number) {
      return transaction(() => {
        const position = (
          sqlite
            .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM service_groups')
            .get() as { position: number }
        ).position;
        const result = sqlite
          .prepare('INSERT INTO service_groups(name,position,page_id) VALUES(?,?,?)')
          .run(name, position, pageId ?? firstPageId());
        return sqlite
          .prepare(
            'SELECT id,name,position,columns,page_id as pageId FROM service_groups WHERE id=?',
          )
          .get(Number(result.lastInsertRowid)) as Group;
      });
    },
    setGroupColumns(id: number, columns: number | null) {
      if (
        columns !== null &&
        !(Number.isInteger(columns) && columns >= 1 && columns <= MAX_GROUP_COLUMNS)
      )
        throw new RangeError('columns');
      return transaction(() => {
        const result = sqlite
          .prepare('UPDATE service_groups SET columns=? WHERE id=?')
          .run(columns, id);
        if (!result.changes) return null;
        return sqlite
          .prepare(
            'SELECT id,name,position,columns,page_id as pageId FROM service_groups WHERE id=?',
          )
          .get(id) as Group;
      });
    },
    renameGroup(id: number, name: string) {
      return transaction(() => {
        const current = sqlite
          .prepare(
            'SELECT id,name,position,columns,page_id as pageId FROM service_groups WHERE id=?',
          )
          .get(id) as Group | undefined;
        if (!current) return null;
        sqlite.prepare('UPDATE service_groups SET name=? WHERE id=?').run(name, id);
        const changed = sqlite
          .prepare('UPDATE services SET category=? WHERE category=?')
          .run(name, current.name);
        if (changed.changes) bumpVersion();
        return sqlite
          .prepare(
            'SELECT id,name,position,columns,page_id as pageId FROM service_groups WHERE id=?',
          )
          .get(id) as Group;
      });
    },
    deleteGroup(id: number) {
      return transaction(() => {
        const current = sqlite.prepare('SELECT id,name FROM service_groups WHERE id=?').get(id) as
          { id: number; name: string } | undefined;
        if (!current) return 'missing' as const;
        if (sqlite.prepare('SELECT id FROM services WHERE category=? LIMIT 1').get(current.name))
          return 'not-empty' as const;
        sqlite.prepare('DELETE FROM service_groups WHERE id=?').run(id);
        renumberGroups(sqlite);
        return 'deleted' as const;
      });
    },
    reorderGroups(names: string[]) {
      return transaction(() => {
        const current = selectGroups();
        if (
          names.length !== current.length ||
          new Set(names).size !== current.length ||
          names.some((name) => !current.some((group) => group.name === name))
        )
          return false;
        const update = sqlite.prepare('UPDATE service_groups SET position=? WHERE name=?');
        names.forEach((name, position) => update.run(position, name));
        return true;
      });
    },
  };
}
