import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  MAX_PAGES,
  parseHostLink,
  validateService,
  type CheckType,
  type HostLink,
  type Service,
  type ServiceInput,
} from '@homora/shared';
import { renumberGroups } from './group-order.js';
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
type Group = {
  id: number;
  name: string;
  position: number;
  columns: number | null;
  pageId: number | null;
};
export type ServiceChange =
  | { op: 'create'; service: ServiceInput; page?: string }
  | { op: 'update'; id: number; service: ServiceInput }
  | { op: 'delete'; id: number };

/** The card-to-guest link points to a connection that is missing or is not Proxmox. */
export class HostLinkError extends Error {
  readonly code = 'invalid-host' as const;
  constructor() {
    super('Choose an existing Proxmox connection for the host.');
    this.name = 'HostLinkError';
  }
}

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
        `SELECT id,name,url,category,description,icon,position,allow_private as allowPrivate,check_type as checkType,check_interval as checkInterval,expected_status as expectedStatus,check_path as checkPath,check_match as checkMatch FROM services ORDER BY ${order}`,
      )
      .all() as unknown as ServiceRow[];
  const selectService = (id: number) =>
    sqlite
      .prepare(
        'SELECT id,name,url,category,description,icon,position,allow_private as allowPrivate,check_type as checkType,check_interval as checkInterval,expected_status as expectedStatus,check_path as checkPath,check_match as checkMatch FROM services WHERE id=?',
      )
      .get(id) as ServiceRow | undefined;
  type HostRow = {
    id: number;
    connectionId: number | null;
    node: string | null;
    vmid: number | null;
    type: string | null;
  };
  /** Links by card id. A link whose connection was deleted (or a partial row) counts as absent. */
  const selectHosts = () => {
    const hosts = new Map<number, HostLink>();
    const rows = sqlite
      .prepare(
        'SELECT id,host_connection_id as connectionId,host_node as node,host_vmid as vmid,host_type as type FROM services WHERE host_connection_id IS NOT NULL',
      )
      .all() as unknown as HostRow[];
    for (const row of rows) {
      const link = parseHostLink({
        connectionId: row.connectionId,
        node: row.node,
        vmid: row.vmid,
        type: row.type,
      });
      if (link) hosts.set(row.id, link);
    }
    return hosts;
  };
  /** Stores ids only, after checking the connection. Pass null to unlink. */
  const writeHost = (id: number, host: HostLink | null) => {
    if (host) {
      const connection = sqlite
        .prepare('SELECT type FROM integration_instances WHERE id=?')
        .get(host.connectionId) as { type: string } | undefined;
      if (connection?.type !== 'proxmox') throw new HostLinkError();
    }
    sqlite
      .prepare(
        'UPDATE services SET host_connection_id=?,host_node=?,host_vmid=?,host_type=? WHERE id=?',
      )
      .run(
        host?.connectionId ?? null,
        host?.node ?? null,
        host?.vmid ?? null,
        host?.type ?? null,
        id,
      );
  };
  // A group with no page (never expected after the migration) counts as being on the first page.
  const selectGroups = () =>
    sqlite
      .prepare(
        'SELECT id,name,position,columns,COALESCE(page_id,(SELECT id FROM pages ORDER BY position,id LIMIT 1)) as pageId FROM service_groups ORDER BY position,name',
      )
      .all() as Group[];
  const bumpVersion = () =>
    sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
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
  const nextServicePosition = (category: string) => {
    const row = sqlite
      .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM services WHERE category=?')
      .get(category) as { position: number };
    return row.position;
  };

  if (!sqlite.prepare('SELECT id FROM config_version WHERE id=1').get())
    sqlite.prepare('INSERT INTO config_version(id,version) VALUES(1,1)').run();

  /**
   * Page for a service that may create its group: only a new group takes `page` (the first page
   * when none is given); an existing group stays where it is and must agree with `page`.
   */
  function pageForNewService(category: string, page?: string): number | undefined {
    const wanted = page === undefined ? undefined : pageIdByName(page);
    if (page !== undefined && wanted === undefined) throw new Error('Page not found');
    const current = pageOfGroup(category);
    if (current !== undefined && wanted !== undefined && current !== wanted)
      throw new Error('Group is on another page');
    return wanted;
  }

  function applyProposal(change: ServiceChange) {
    if (change.op === 'create') {
      const service = validateService(change.service);
      ensureGroup(service.category, null, pageForNewService(service.category, change.page));
      const created = sqlite
        .prepare(
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path,check_match) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
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
          service.expectedStatus ?? null,
          service.checkPath ?? null,
          service.checkMatch ?? null,
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
        'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=?,check_type=?,check_interval=?,expected_status=?,check_path=?,check_match=? WHERE id=?',
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
        service.expectedStatus === undefined
          ? (current.expectedStatus ?? null)
          : service.expectedStatus,
        service.checkPath === undefined ? (current.checkPath ?? null) : service.checkPath,
        service.checkMatch === undefined ? (current.checkMatch ?? null) : service.checkMatch,
        change.id,
      );
    bumpVersion();
    return selectService(change.id);
  }

  const NEW_SERVICES_PRIVATE_KEY = 'new_services_allow_private';

  return {
    /**
     * Instance-wide initial value of `allowPrivate` for services created in the web UI. It is only
     * a default: stored services never change with it, and imports, discovery and proposals do not
     * read it.
     */
    newServicesAllowPrivate() {
      const row = sqlite
        .prepare('SELECT value FROM app_settings WHERE key=?')
        .get(NEW_SERVICES_PRIVATE_KEY) as { value: string } | undefined;
      return row?.value === 'true';
    },
    setNewServicesAllowPrivate(value: boolean) {
      sqlite
        .prepare(
          'INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        )
        .run(NEW_SERVICES_PRIVATE_KEY, String(value));
    },
    listServices() {
      const hosts = selectHosts();
      return selectServices().map((row) => ({
        ...row,
        allowPrivate: Boolean(row.allowPrivate),
        host: hosts.get(row.id) ?? null,
      }));
    },
    /** Card-to-guest links by card id, for impact and suggestions. */
    listHosts: selectHosts,
    listMcpServices() {
      return sqlite
        .prepare(
          `SELECT s.id,s.name,s.url,s.category,s.description,
             (SELECT p.name FROM pages p WHERE p.id=COALESCE(g.page_id,(SELECT id FROM pages ORDER BY position,id LIMIT 1))) AS page
           FROM services s LEFT JOIN service_groups g ON g.name=s.category ORDER BY s.category,s.name`,
        )
        .all();
    },
    findService: selectService,
    nextServicePosition,
    listGroups: selectGroups,
    pageIdByName,
    pageOfGroup,
    listPages: () =>
      sqlite.prepare('SELECT id,name FROM pages ORDER BY position,id').all() as {
        id: number;
        name: string;
      }[],
    pageExists: (id: number) => Boolean(sqlite.prepare('SELECT id FROM pages WHERE id=?').get(id)),
    /** Fails like applying would, so a proposal is refused up front rather than at review. */
    checkNewServicePage: pageForNewService,
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
      const pageNames = new Map(
        (
          sqlite.prepare('SELECT id,name FROM pages ORDER BY position,id').all() as {
            id: number;
            name: string;
          }[]
        ).map((row) => [row.id, row.name]),
      );
      return {
        pages: [...pageNames.values()],
        groups: selectGroups().map((group) => ({
          ...group,
          page: group.pageId === null ? undefined : pageNames.get(group.pageId),
        })),
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
          pages: (
            sqlite.prepare('SELECT id,name FROM pages ORDER BY position,id').all() as {
              id: number;
              name: string;
            }[]
          ).map((page) => page.name),
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
        /** Put every new group on this page instead of the pages named in the file. */
        pageId?: number;
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
        const existingPages = sqlite
          .prepare('SELECT id,name FROM pages ORDER BY position,id')
          .all() as { id: number; name: string }[];
        if (
          options.pageId !== undefined &&
          !existingPages.some((page) => page.id === options.pageId)
        )
          return { status: 'stale' as const };
        const plan = planImport(parsed, {
          groups: selectGroups().map((group) => group.name),
          services: selectServices().map((row) => ({ category: row.category, url: row.url })),
          pages: existingPages.map((page) => page.name),
        });
        // Pages the file asks for are created while there is room; the rest fall back to the first page.
        const pageIds = new Map(
          existingPages.map((page) => [page.name.toLocaleLowerCase(), page.id]),
        );
        if (options.pageId === undefined) {
          let count = existingPages.length;
          for (const page of plan.pages) {
            const key = page.name.toLocaleLowerCase();
            if (pageIds.has(key)) continue;
            if (count >= MAX_PAGES) {
              plan.issues.push({
                path: `pages.${page.name}`,
                code: 'page-limit',
                severity: 'warning',
              });
              continue;
            }
            const created = sqlite
              .prepare(
                'INSERT INTO pages(name,position) VALUES(?,(SELECT COALESCE(MAX(position),-1)+1 FROM pages))',
              )
              .run(page.name);
            pageIds.set(key, Number(created.lastInsertRowid));
            count += 1;
          }
        }
        const insert = sqlite.prepare(
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path,check_match) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        );
        const queue = parsed.document.groups.flatMap((group) =>
          group.services.map((service) => ({ group: group.name, service })),
        );
        let created = 0;
        const columnsOf = new Map(
          parsed.document.groups.map((group) => [group.name, group.columns ?? null]),
        );
        for (const group of plan.groups)
          ensureGroup(
            group.name,
            columnsOf.get(group.name) ?? null,
            options.pageId ??
              (group.page ? pageIds.get(group.page.toLocaleLowerCase()) : undefined),
          );
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
            valid.expectedStatus ?? null,
            valid.checkPath ?? null,
            valid.checkMatch ?? null,
          );
          created += 1;
        });
        if (created) bumpVersion();
        return { status: 'applied' as const, plan, created };
      });
    },
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
    createService(input: Partial<ServiceInput>, host: HostLink | null = null) {
      return transaction(() => {
        const service = validateService(input);
        ensureGroup(service.category);
        service.position = nextServicePosition(service.category);
        const result = sqlite
          .prepare(
            'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path,check_match) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
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
            service.expectedStatus ?? null,
            service.checkPath ?? null,
            service.checkMatch ?? null,
          );
        const created = selectService(Number(result.lastInsertRowid));
        if (!created) throw new Error('Created service could not be loaded');
        if (host) writeHost(created.id, host);
        bumpVersion();
        return { ...created, host };
      });
    },
    /** `host` undefined keeps the current link; null unlinks. */
    updateService(id: number, input: Partial<ServiceInput>, host?: HostLink | null) {
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
            'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=?,check_type=?,check_interval=?,expected_status=?,check_path=?,check_match=? WHERE id=?',
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
            service.expectedStatus === undefined
              ? (current.expectedStatus ?? null)
              : service.expectedStatus,
            service.checkPath === undefined ? (current.checkPath ?? null) : service.checkPath,
            service.checkMatch === undefined ? (current.checkMatch ?? null) : service.checkMatch,
            id,
          );
        if (host !== undefined) writeHost(id, host);
        bumpVersion();
        const updated = selectService(id);
        return updated ? { ...updated, host: selectHosts().get(id) ?? null } : updated;
      });
    },
    /** Links or unlinks a card without touching its other settings. False when the card is gone. */
    setServiceHost(id: number, host: HostLink | null) {
      return transaction(() => {
        if (!selectService(id)) return false;
        writeHost(id, host);
        bumpVersion();
        return true;
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
