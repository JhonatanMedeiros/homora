import type { DatabaseSync } from 'node:sqlite';
import { markLegacyConnectionDeleted } from './legacy-integrations.js';

/** Caller owns the transaction. Safe to run inside a validation savepoint. */
export function deleteConnectionRow(db: DatabaseSync, id: number) {
  if (!db.prepare('SELECT id FROM integration_instances WHERE id=?').get(id)) return 'missing';
  if (
    db.prepare('SELECT id FROM integration_widgets WHERE integration_id=? LIMIT 1').get(id) ||
    db.prepare('SELECT id FROM page_widgets WHERE connection_id=? LIMIT 1').get(id)
  )
    return 'has-widgets';
  markLegacyConnectionDeleted(db, id);
  db.prepare('DELETE FROM integration_instances WHERE id=?').run(id);
  return 'deleted';
}
