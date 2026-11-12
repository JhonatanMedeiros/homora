import type { DatabaseSync } from 'node:sqlite';

/** Call within the transaction that removed the group. */
export function renumberGroups(db: DatabaseSync) {
  const groups = db.prepare('SELECT id FROM service_groups ORDER BY position,id').all() as {
    id: number;
  }[];
  const update = db.prepare('UPDATE service_groups SET position=? WHERE id=?');
  groups.forEach((group, position) => update.run(position, group.id));
}
