import type { DatabaseSync } from 'node:sqlite';
import { validateProbe, type Probe, type ProbeInput } from '@homora/shared';

type Row = {
  id: number;
  name: string;
  address: string;
  checkType: Probe['checkType'];
  checkInterval: number | null;
  expectedStatus: string | null;
  checkMatch: string | null;
  allowPrivate: number;
  isPublic: number;
};

const COLUMNS = `m.id,m.name,m.check_url AS address,m.check_type AS checkType,m.check_interval AS checkInterval,
  m.expected_status AS expectedStatus,m.check_match AS checkMatch,m.allow_private AS allowPrivate,m.is_public AS isPublic`;
/** A probe is a monitor that has no card. */
const PROBES = `FROM monitors m WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.id=m.id)`;

const toProbe = (row: Row): Probe => ({
  ...row,
  allowPrivate: Boolean(row.allowPrivate),
  isPublic: Boolean(row.isPublic),
});

/** Monitors that exist on their own: checked, charted and alerted on, but not shown as a card. */
export function createProbeStore(sqlite: DatabaseSync) {
  const find = (id: number) =>
    sqlite.prepare(`SELECT ${COLUMNS} ${PROBES} AND m.id=?`).get(id) as Row | undefined;
  return {
    list(): Probe[] {
      return (
        sqlite.prepare(`SELECT ${COLUMNS} ${PROBES} ORDER BY m.name,m.id`).all() as Row[]
      ).map(toProbe);
    },
    get(id: number): Probe | null {
      const row = find(id);
      return row ? toProbe(row) : null;
    },
    /** Throws `ProbeValidationError` for a form that is not valid. */
    create(input: Partial<ProbeInput>): Probe {
      const probe = validateProbe(input);
      const result = sqlite
        .prepare(
          'INSERT INTO monitors(name,check_type,check_interval,expected_status,check_match,check_url,allow_private) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          probe.name,
          probe.checkType,
          probe.checkInterval,
          probe.expectedStatus,
          probe.checkMatch,
          probe.address,
          probe.allowPrivate ? 1 : 0,
        );
      return toProbe(find(Number(result.lastInsertRowid))!);
    },
    /** Null when there is no such probe (a card's monitor is not one). */
    update(id: number, input: Partial<ProbeInput>): Probe | null {
      if (!find(id)) return null;
      const probe = validateProbe(input);
      sqlite
        .prepare(
          'UPDATE monitors SET name=?,check_type=?,check_interval=?,expected_status=?,check_match=?,check_url=?,allow_private=? WHERE id=?',
        )
        .run(
          probe.name,
          probe.checkType,
          probe.checkInterval,
          probe.expectedStatus,
          probe.checkMatch,
          probe.address,
          probe.allowPrivate ? 1 : 0,
          id,
        );
      return toProbe(find(id)!);
    },
    /** Removes the probe and, by cascade, its whole history. */
    remove(id: number): boolean {
      if (!find(id)) return false;
      sqlite.prepare('DELETE FROM monitors WHERE id=?').run(id);
      return true;
    },
  };
}

export type ProbeStore = ReturnType<typeof createProbeStore>;
