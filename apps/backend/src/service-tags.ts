import type { DatabaseSync } from 'node:sqlite';
import { normalizeTag, TAGS_MAX_PER_SERVICE } from '@homora/shared';

/** Labels on services. Pure presentation: never part of the check signature or the monitor. */
export function createTagStore(db: DatabaseSync) {
  return {
    all(): Record<number, string[]> {
      const rows = db
        .prepare('SELECT service_id AS id,tag FROM service_tags ORDER BY service_id,tag')
        .all() as { id: number; tag: string }[];
      const result: Record<number, string[]> = {};
      for (const row of rows) (result[row.id] ??= []).push(row.tag);
      return result;
    },
    /** Replaces the tags of a service; returns them normalised, or `null` if the service is gone. */
    set(serviceId: number, input: string[]): string[] | null {
      if (!db.prepare('SELECT 1 FROM services WHERE id=?').get(serviceId)) return null;
      const tags = [
        ...new Set(input.map(normalizeTag).filter((tag): tag is string => tag !== null)),
      ]
        .slice(0, TAGS_MAX_PER_SERVICE)
        .sort();
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM service_tags WHERE service_id=?').run(serviceId);
        const insert = db.prepare('INSERT INTO service_tags(service_id,tag) VALUES(?,?)');
        for (const tag of tags) insert.run(serviceId, tag);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return tags;
    },
  };
}
export type TagStore = ReturnType<typeof createTagStore>;
