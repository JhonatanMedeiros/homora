import type { DatabaseSync } from 'node:sqlite';
import {
  validateService,
  type CheckType,
  type HostLink,
  type Service,
  type ServiceInput,
} from '@homora/shared';

export type ServiceRow = Omit<
  Service,
  'position' | 'allowPrivate' | 'checkType' | 'checkInterval'
> & {
  position: number;
  allowPrivate: number | boolean;
  checkType: CheckType;
  checkInterval: number | null;
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

/** Owns service card mutations and application of reviewed service changes. */
export function createServiceCardConfiguration({
  sqlite,
  transaction,
  selectService,
  selectHosts,
  writeHost,
  nextServicePosition,
  ensureGroup,
  pageForNewService,
  bumpVersion,
}: {
  sqlite: DatabaseSync;
  transaction: <T>(work: () => T) => T;
  selectService: (id: number) => ServiceRow | undefined;
  selectHosts: () => Map<number, HostLink>;
  writeHost: (id: number, host: HostLink | null) => void;
  nextServicePosition: (category: string) => number;
  ensureGroup: (name: string, columns?: number | null, pageId?: number) => void;
  pageForNewService: (category: string, page?: string) => number | undefined;
  bumpVersion: () => void;
}) {
  function applyProposal(change: ServiceChange) {
    if (change.op === 'create') {
      const service = validateService(change.service);
      ensureGroup(service.category, null, pageForNewService(service.category, change.page));
      const created = sqlite
        .prepare(
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
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
        'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=?,check_type=?,check_interval=?,expected_status=?,check_path=? WHERE id=?',
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
        change.id,
      );
    bumpVersion();
    return selectService(change.id);
  }

  function createService(input: Partial<ServiceInput>, host: HostLink | null = null) {
    return transaction(() => {
      const service = validateService(input);
      ensureGroup(service.category);
      service.position = nextServicePosition(service.category);
      const result = sqlite
        .prepare(
          'INSERT INTO services(name,url,category,description,icon,position,allow_private,check_type,check_interval,expected_status,check_path) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
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
        );
      const created = selectService(Number(result.lastInsertRowid));
      if (!created) throw new Error('Created service could not be loaded');
      if (host) writeHost(created.id, host);
      bumpVersion();
      return { ...created, host };
    });
  }

  /** `host` undefined keeps the current link; null unlinks. */
  function updateService(id: number, input: Partial<ServiceInput>, host?: HostLink | null) {
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
          'UPDATE services SET name=?,url=?,category=?,description=?,icon=?,position=?,allow_private=?,check_type=?,check_interval=?,expected_status=?,check_path=? WHERE id=?',
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
          id,
        );
      if (host !== undefined) writeHost(id, host);
      bumpVersion();
      const updated = selectService(id);
      return updated ? { ...updated, host: selectHosts().get(id) ?? null } : updated;
    });
  }

  function setServiceHost(id: number, host: HostLink | null) {
    return transaction(() => {
      if (!selectService(id)) return false;
      writeHost(id, host);
      bumpVersion();
      return true;
    });
  }

  function deleteService(id: number) {
    return transaction(() => {
      const result = sqlite.prepare('DELETE FROM services WHERE id=?').run(id);
      if (result.changes) bumpVersion();
      return Boolean(result.changes);
    });
  }

  function reorderServices(category: string, ids: number[]) {
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
  }

  return {
    applyProposal,
    createService,
    updateService,
    setServiceHost,
    deleteService,
    reorderServices,
  };
}
