import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { validateService, type CheckType, type Service, type ServiceInput } from '@homora/shared';
import {
  MAX_GROUP_COLUMNS,
  planImport,
  type ImportPlan,
  type ParsedImport,
} from './config-transfer.js';

type ServiceRow = Omit<Service, 'position' | 'allowPrivate' | 'checkType' | 'checkInterval'> & {
  position: number;
  allowPrivate: number | boolean;
  checkType: CheckType;
  checkInterval: number | null;
};
type Group = { id: number; name: string; position: number; columns: number | null };
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
        `SELECT id,name,url,category,description,icon,position,allow_private as allowPrivate,check_type as checkType,check_interval as checkInterval FROM services ORDER BY ${order}`,
      )
      .all() as unknown as ServiceRow[];
  const selectService = (id: number) =>
    sqlite
      .prepare(
        'SELECT id,name,url,category,description,icon,position,allow_private as allowPrivate,check_type as checkType,check_interval as checkInterval FROM services WHERE id=?',
      )
      .get(id) as ServiceRow | undefined;
  const selectGroups = () =>
    sqlite
      .prepare('SELECT id,name,position,columns FROM service_groups ORDER BY position,name')
      .all() as Group[];
  const bumpVersion = () =>
    sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
  const ensureGroup = (name: string, columns: number | null = null) => {
    const exists = sqlite.prepare('SELECT id FROM service_groups WHERE name=?').get(name);
    if (exists) return;
    const next = sqlite
      .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM service_groups')
      .get() as { position: number };
    sqlite
      .prepare('INSERT INTO service_groups(name,position,columns) VALUES(?,?,?)')
      .run(name, next.position, columns);
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
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          service.name,
          service.url,
          service.category,
          service.description,
          service.icon ?? '',
          service.position ?? 0,
          service.allowPrivate ? 1 : 0,
          service.checkType ?? 'http',
          service.checkInterval ?? null,
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
        'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=?,check_type=?,check_interval=? WHERE id=?',
      )
      .run(
        service.name,
        service.url,
        service.category,
        service.description,
        service.icon ?? '',
        position,
        service.allowPrivate ? 1 : 0,
        service.checkType ?? current.checkType,
        service.checkInterval === undefined ? current.checkInterval : service.checkInterval,
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
    /** Groups and cards in current order, for export. */
    exportData() {
      return {
        groups: selectGroups(),
        services: selectServices().map((row) => ({
          ...row,
          allowPrivate: Boolean(row.allowPrivate),
        })) as Service[],
      };
    },
    /** Previews an import without persisting anything. */
    previewImport(parsed: ParsedImport) {
      const rows = selectServices();
      return {
        version: (
          sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as {
            version: number;
          }
        ).version,
        plan: planImport(parsed, {
          groups: selectGroups().map((group) => group.name),
          services: rows.map((row) => ({ category: row.category, url: row.url })),
        }),
      };
    },
    /**
     * Applies an import in a single transaction, recalculating the plan against current
     * state. Only adds groups and cards; private network authorization is retained from the file
     * only if `keepPrivate` is true; `grantPrivate` (explicit choice during review) authorizes all new cards. `expectedVersion` rejects application if configuration
     * changed after the preview.
     */
    applyImport(
      parsed: ParsedImport,
      options: {
        keepPrivate: boolean;
        grantPrivate?: boolean;
        expectedVersion?: number;
        guard?: () => boolean;
      },
    ): { status: 'stale' } | { status: 'applied'; plan: ImportPlan; created: number } {
      return transaction(() => {
        const current = (
          sqlite.prepare('SELECT version FROM config_version WHERE id=1').get() as {
            version: number;
          }
        ).version;
        if (
          (options.expectedVersion !== undefined && options.expectedVersion !== current) ||
          (options.guard && !options.guard())
        )
          return { status: 'stale' as const };
        const plan = planImport(parsed, {
          groups: selectGroups().map((group) => group.name),
          services: selectServices().map((row) => ({ category: row.category, url: row.url })),
        });
        const insert = sqlite.prepare(
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval) VALUES(?,?,?,?,?,?,?,?,?)',
        );
        const queue = parsed.document.groups.flatMap((group) =>
          group.services.map((service) => ({ group: group.name, service })),
        );
        let created = 0;
        const columnsOf = new Map(
          parsed.document.groups.map((group) => [group.name, group.columns ?? null]),
        );
        for (const group of plan.groups) ensureGroup(group.name, columnsOf.get(group.name) ?? null);
        queue.forEach(({ group, service }, index) => {
          if (plan.services[index].status !== 'new') return;
          const valid = validateService({
            ...service,
            category: group,
            allowPrivate:
              options.grantPrivate === true || (options.keepPrivate && service.allowPrivate),
          });
          insert.run(
            valid.name,
            valid.url,
            valid.category,
            valid.description,
            valid.icon ?? '',
            nextServicePosition(valid.category),
            valid.allowPrivate ? 1 : 0,
            valid.checkType ?? 'http',
            valid.checkInterval ?? null,
          );
          created += 1;
        });
        if (created) bumpVersion();
        return { status: 'applied' as const, plan, created };
      });
    },
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
          .prepare('SELECT id,name,position,columns FROM service_groups WHERE id=?')
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
          .prepare('SELECT id,name,position,columns FROM service_groups WHERE id=?')
          .get(id) as Group;
      });
    },
    renameGroup(id: number, name: string) {
      return transaction(() => {
        const current = sqlite
          .prepare('SELECT id,name,position,columns FROM service_groups WHERE id=?')
          .get(id) as Group | undefined;
        if (!current) return null;
        sqlite.prepare('UPDATE service_groups SET name=? WHERE id=?').run(name, id);
        const changed = sqlite
          .prepare('UPDATE services SET category=? WHERE category=?')
          .run(name, current.name);
        if (changed.changes) bumpVersion();
        return sqlite
          .prepare('SELECT id,name,position,columns FROM service_groups WHERE id=?')
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
            'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval) VALUES(?,?,?,?,?,?,?,?,?)',
          )
          .run(
            service.name,
            service.url,
            service.category,
            service.description,
            service.icon ?? '',
            service.position ?? 0,
            service.allowPrivate ? 1 : 0,
            service.checkType ?? 'http',
            service.checkInterval ?? null,
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
            'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=?,check_type=?,check_interval=? WHERE id=?',
          )
          .run(
            service.name,
            service.url,
            service.category,
            service.description,
            service.icon ?? '',
            service.position ?? 0,
            service.allowPrivate ? 1 : 0,
            service.checkType ?? current.checkType,
            service.checkInterval === undefined ? current.checkInterval : service.checkInterval,
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
