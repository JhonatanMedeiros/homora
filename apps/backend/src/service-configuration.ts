import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { validateService, type Service, type ServiceInput } from '@homora/shared';

type ServiceRow = Omit<Service, 'position' | 'allowPrivate'> & {
  position: number;
  allowPrivate: number | boolean;
};
type Group = { id: number; name: string; position: number };
export type ServiceChange =
  | { op: 'create'; service: ServiceInput }
  | { op: 'update'; id: number; service: ServiceInput }
  | { op: 'delete'; id: number };

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Owns service-card and group invariants, ordering, and configuration versioning. */
export function createServiceConfiguration(sqlite: DatabaseSync) {
  const transaction = <T>(work: () => T): T => {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  };
  const selectServices = (order = 'category, position, name') =>
    sqlite
      .prepare(
        `SELECT id,name,url,category,description,icon,position,allow_private as allowPrivate FROM services ORDER BY ${order}`,
      )
      .all() as unknown as ServiceRow[];
  const selectService = (id: number) =>
    sqlite
      .prepare(
        'SELECT id,name,url,category,description,icon,position,allow_private as allowPrivate FROM services WHERE id=?',
      )
      .get(id) as ServiceRow | undefined;
  const selectGroups = () =>
    sqlite
      .prepare('SELECT id,name,position FROM service_groups ORDER BY position,name')
      .all() as Group[];
  const bumpVersion = () =>
    sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
  const ensureGroup = (name: string) => {
    const exists = sqlite.prepare('SELECT id FROM service_groups WHERE name=?').get(name);
    if (exists) return;
    const next = sqlite
      .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM service_groups')
      .get() as { position: number };
    sqlite
      .prepare('INSERT INTO service_groups(name,position) VALUES(?,?)')
      .run(name, next.position);
  };
  const nextServicePosition = (category: string) => {
    const row = sqlite
      .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM services WHERE category=?')
      .get(category) as { position: number };
    return row.position;
  };

  if (!sqlite.prepare('SELECT id FROM config_version WHERE id=1').get())
    sqlite.prepare('INSERT INTO config_version(id,version) VALUES(1,1)').run();

  function applyProposal(change: ServiceChange) {
    if (change.op === 'create') {
      const service = validateService(change.service);
      ensureGroup(service.category);
      const created = sqlite
        .prepare(
          'INSERT INTO services(name,url,category,description,icon,position,allow_private) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          service.name,
          service.url,
          service.category,
          service.description,
          service.icon ?? '',
          service.position ?? 0,
          service.allowPrivate ? 1 : 0,
        );
      bumpVersion();
      const row = selectService(Number(created.lastInsertRowid));
      if (!row) throw new Error('Created service could not be loaded');
      return row;
    }
    if (change.op === 'delete') {
      const result = sqlite.prepare('DELETE FROM services WHERE id=?').run(change.id);
      if (!result.changes) throw new Error('Service not found');
      bumpVersion();
      return true;
    }
    const current = selectService(change.id);
    if (!current) throw new Error('Service not found');
    const service = validateService(change.service);
    ensureGroup(service.category);
    const position = change.service.position ?? current.position;
    sqlite
      .prepare(
        'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=? WHERE id=?',
      )
      .run(
        service.name,
        service.url,
        service.category,
        service.description,
        service.icon ?? '',
        position,
        service.allowPrivate ? 1 : 0,
        change.id,
      );
    bumpVersion();
    return selectService(change.id);
  }

  return {
    listServices() {
      return selectServices().map((row) => ({ ...row, allowPrivate: Boolean(row.allowPrivate) }));
    },
    listMcpServices() {
      return sqlite
        .prepare('SELECT id,name,url,category,description FROM services ORDER BY category,name')
        .all();
    },
    findService: selectService,
    nextServicePosition,
    listGroups: selectGroups,
    version() {
      return (
        sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as { version: number }
      ).version;
    },
    configHash() {
      return hash(selectServices('id'));
    },
    transaction,
    applyProposal,
    createGroup(name: string) {
      return transaction(() => {
        const position = (
          sqlite
            .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM service_groups')
            .get() as { position: number }
        ).position;
        const result = sqlite
          .prepare('INSERT INTO service_groups(name,position) VALUES(?,?)')
          .run(name, position);
        return sqlite
          .prepare('SELECT id,name,position FROM service_groups WHERE id=?')
          .get(Number(result.lastInsertRowid)) as Group;
      });
    },
    renameGroup(id: number, name: string) {
      return transaction(() => {
        const current = sqlite
          .prepare('SELECT id,name,position FROM service_groups WHERE id=?')
          .get(id) as Group | undefined;
        if (!current) return null;
        sqlite.prepare('UPDATE service_groups SET name=? WHERE id=?').run(name, id);
        const changed = sqlite
          .prepare('UPDATE services SET category=? WHERE category=?')
          .run(name, current.name);
        if (changed.changes) bumpVersion();
        return sqlite
          .prepare('SELECT id,name,position FROM service_groups WHERE id=?')
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
    createService(input: Partial<ServiceInput>) {
      return transaction(() => {
        const service = validateService(input);
        ensureGroup(service.category);
        service.position = nextServicePosition(service.category);
        const result = sqlite
          .prepare(
            'INSERT INTO services(name,url,category,description,icon,position,allow_private) VALUES(?,?,?,?,?,?,?)',
          )
          .run(
            service.name,
            service.url,
            service.category,
            service.description,
            service.icon ?? '',
            service.position ?? 0,
            service.allowPrivate ? 1 : 0,
          );
        bumpVersion();
        const created = selectService(Number(result.lastInsertRowid));
        if (!created) throw new Error('Created service could not be loaded');
        return created;
      });
    },
    updateService(id: number, input: Partial<ServiceInput>) {
      return transaction(() => {
        const current = selectService(id);
        if (!current) return null;
        const service = validateService(input);
        ensureGroup(service.category);
        service.position =
          service.category === current.category
            ? current.position
            : nextServicePosition(service.category);
        sqlite
          .prepare(
            'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=? WHERE id=?',
          )
          .run(
            service.name,
            service.url,
            service.category,
            service.description,
            service.icon ?? '',
            service.position ?? 0,
            service.allowPrivate ? 1 : 0,
            id,
          );
        bumpVersion();
        return selectService(id);
      });
    },
    deleteService(id: number) {
      return transaction(() => {
        const result = sqlite.prepare('DELETE FROM services WHERE id=?').run(id);
        if (result.changes) bumpVersion();
        return Boolean(result.changes);
      });
    },
    reorderServices(category: string, ids: number[]) {
      return transaction(() => {
        const current = sqlite
          .prepare('SELECT id FROM services WHERE category=? ORDER BY position,name')
          .all(category) as { id: number }[];
        if (
          ids.length !== current.length ||
          new Set(ids).size !== current.length ||
          ids.some((id) => !current.some((service) => service.id === id))
        )
          return false;
        const update = sqlite.prepare('UPDATE services SET position=? WHERE id=?');
        ids.forEach((id, position) => update.run(position, id));
        if (ids.length) bumpVersion();
        return true;
      });
    },
  };
}
