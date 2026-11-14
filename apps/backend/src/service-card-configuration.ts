import type { DatabaseSync } from 'node:sqlite';
import {
  validateService,
  type CheckType,
  type HostLink,
  type Service,
  type ServiceLink,
  type ServiceInput,
} from '@homora/shared';

export type ServiceRow = Omit<
  Service,
  'position' | 'allowPrivate' | 'checkInsecure' | 'checkType' | 'checkInterval'
> & {
  position: number;
  allowPrivate: number | boolean;
  checkInsecure: number | boolean;
  checkType: CheckType;
  checkInterval: number | null;
};

export type ServiceChange =
  | { op: 'create'; service: ServiceInput; page?: string }
  | { op: 'update'; id: number; service: ServiceInput }
  | { op: 'delete'; id: number };

/** The card-to-guest link points to a connection that is missing or lacks host inventory. */
export class HostLinkError extends Error {
  readonly code = 'invalid-host' as const;
  constructor() {
    super('Choose an existing host inventory connection.');
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
  writeLinks,
  selectServiceLinks,
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
  /** Replaces a card's extra addresses; throws on invalid input. Runs in the caller's transaction. */
  writeLinks: (id: number, links: unknown) => void;
  selectServiceLinks: (id: number) => ServiceLink[];
}) {
  /** A card is two rows with one id: what is monitored, and how it is shown. */
  function insertCard(service: ServiceInput, position: number) {
    if (service.checkInsecure && !service.allowPrivate) throw new Error('Invalid TLS grant');
    const monitor = sqlite
      .prepare(
        'INSERT INTO monitors(name,allow_private,check_insecure,check_type,check_interval,expected_status,check_path,check_url,check_match) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        service.name,
        service.allowPrivate ? 1 : 0,
        service.checkInsecure ? 1 : 0,
        service.checkType ?? 'http',
        service.checkInterval ?? null,
        service.expectedStatus ?? null,
        service.checkPath ?? null,
        service.checkUrl ?? null,
        service.checkMatch ?? null,
      );
    const id = Number(monitor.lastInsertRowid);
    sqlite
      .prepare(
        'INSERT INTO services(id,url,category,description,icon,position,open_target,alias) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        service.url,
        service.category,
        service.description,
        service.icon ?? '',
        position,
        service.openTarget ?? 'new-tab',
        service.alias ?? null,
      );
    return id;
  }

  /** Fields the input leaves out keep the card's current value. */
  function writeCard(id: number, service: ServiceInput, current: ServiceRow, position: number) {
    const insecure = service.checkInsecure ?? Boolean(current.checkInsecure);
    if (insecure && !service.allowPrivate) throw new Error('Invalid TLS grant');
    sqlite
      .prepare(
        'UPDATE monitors SET name=?,allow_private=?,check_insecure=?,check_type=?,check_interval=?,expected_status=?,check_path=?,check_url=?,check_match=? WHERE id=?',
      )
      .run(
        service.name,
        service.allowPrivate ? 1 : 0,
        insecure ? 1 : 0,
        service.checkType ?? current.checkType,
        service.checkInterval === undefined ? current.checkInterval : service.checkInterval,
        service.expectedStatus === undefined
          ? (current.expectedStatus ?? null)
          : service.expectedStatus,
        service.checkPath === undefined ? (current.checkPath ?? null) : service.checkPath,
        service.checkUrl === undefined ? (current.checkUrl ?? null) : service.checkUrl,
        service.checkMatch === undefined ? (current.checkMatch ?? null) : service.checkMatch,
        id,
      );
    sqlite
      .prepare(
        'UPDATE services SET url=?,category=?,description=?,icon=?,position=?,open_target=?,alias=? WHERE id=?',
      )
      .run(
        service.url,
        service.category,
        service.description,
        service.icon ?? '',
        position,
        service.openTarget ?? current.openTarget ?? 'new-tab',
        service.alias === undefined ? (current.alias ?? null) : service.alias,
        id,
      );
  }

  /** Deleting the monitor removes the card, its links and its whole history; probes are not cards. */
  const deleteCard = (id: number) =>
    sqlite.prepare('DELETE FROM monitors WHERE id=? AND id IN (SELECT id FROM services)').run(id);

  function applyProposal(change: ServiceChange) {
    if (change.op === 'create') {
      const service = validateService(change.service);
      ensureGroup(service.category, null, pageForNewService(service.category, change.page));
      const id = insertCard(service, service.position ?? 0);
      bumpVersion();
      const row = selectService(id);
      if (!row) throw new Error('Created service could not be loaded');
      return row;
    }
    if (change.op === 'delete') {
      const result = deleteCard(change.id);
      if (!result.changes) throw new Error('Service not found');
      bumpVersion();
      return true;
    }
    const current = selectService(change.id);
    if (!current) throw new Error('Service not found');
    const service = validateService(change.service);
    ensureGroup(service.category);
    writeCard(change.id, service, current, change.service.position ?? current.position);
    bumpVersion();
    return selectService(change.id);
  }

  /** `links` undefined keeps none (a new card); a list stores those extra addresses. */
  function createService(
    input: Partial<ServiceInput>,
    host: HostLink | null = null,
    links?: unknown,
  ) {
    return transaction(() => {
      const service = validateService(input);
      if (service.checkInsecure && !service.allowPrivate) throw new Error('Invalid TLS grant');
      ensureGroup(service.category);
      service.position = nextServicePosition(service.category);
      const id = insertCard(service, service.position ?? 0);
      const created = selectService(id);
      if (!created) throw new Error('Created service could not be loaded');
      if (host) writeHost(created.id, host);
      if (links !== undefined) writeLinks(created.id, links);
      bumpVersion();
      return {
        ...created,
        checkInsecure: service.checkInsecure === true,
        host,
        links: selectServiceLinks(created.id),
      };
    });
  }

  /** `host` undefined keeps the current link; null unlinks. `links` undefined keeps the addresses. */
  function updateService(
    id: number,
    input: Partial<ServiceInput>,
    host?: HostLink | null,
    links?: unknown,
  ) {
    return transaction(() => {
      const current = selectService(id);
      if (!current) return null;
      const service = validateService(input);
      ensureGroup(service.category);
      service.position =
        service.category === current.category
          ? current.position
          : nextServicePosition(service.category);
      writeCard(id, service, current, service.position ?? 0);
      if (host !== undefined) writeHost(id, host);
      if (links !== undefined) writeLinks(id, links);
      bumpVersion();
      const updated = selectService(id);
      return updated
        ? { ...updated, host: selectHosts().get(id) ?? null, links: selectServiceLinks(id) }
        : updated;
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
      const result = deleteCard(id);
      if (result.changes) bumpVersion();
      return Boolean(result.changes);
    });
  }

  function reorderServices(category: string, ids: number[]) {
    return transaction(() => {
      const current = sqlite
        .prepare('SELECT id FROM service_cards WHERE category=? ORDER BY position,name')
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
