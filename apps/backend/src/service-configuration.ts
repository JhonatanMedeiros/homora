import { createHash } from 'node:crypto';
import { createConfigurationTransfer } from './service-configuration-transfer.js';
import type { DatabaseSync } from 'node:sqlite';
import { parseHostLink, type HostLink } from '@homora/shared';
import { hasInventoryDomain } from '@homora/integrations';
import { createServiceLinkConfiguration } from './service-link-configuration.js';
import { createServiceGroupConfiguration } from './service-group-configuration.js';
import {
  createServiceCardConfiguration,
  HostLinkError,
  type ServiceRow,
} from './service-card-configuration.js';

export { HostLinkError } from './service-card-configuration.js';
export { ServiceLinkError } from './service-link-configuration.js';
export type { ServiceChange } from './service-card-configuration.js';

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
        `SELECT id,name,url,alias,category,description,icon,position,allow_private as allowPrivate,check_insecure as checkInsecure,check_type as checkType,check_interval as checkInterval,expected_status as expectedStatus,check_path as checkPath,check_url as checkUrl,check_match as checkMatch,open_target as openTarget FROM service_cards ORDER BY ${order}`,
      )
      .all() as unknown as ServiceRow[];
  const selectService = (id: number) =>
    sqlite
      .prepare(
        'SELECT id,name,url,alias,category,description,icon,position,allow_private as allowPrivate,check_insecure as checkInsecure,check_type as checkType,check_interval as checkInterval,expected_status as expectedStatus,check_path as checkPath,check_url as checkUrl,check_match as checkMatch,open_target as openTarget FROM service_cards WHERE id=?',
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
      if (!connection || !hasInventoryDomain(connection.type, 'hosts')) throw new HostLinkError();
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
  const nextServicePosition = (category: string) => {
    const row = sqlite
      .prepare('SELECT COALESCE(MAX(position), -1)+1 as position FROM services WHERE category=?')
      .get(category) as { position: number };
    return row.position;
  };

  if (!sqlite.prepare('SELECT id FROM config_version WHERE id=1').get())
    sqlite.prepare('INSERT INTO config_version(id,version) VALUES(1,1)').run();
  const bumpVersion = () =>
    sqlite.prepare('UPDATE config_version SET version=version+1 WHERE id=1').run();
  const groupConfiguration = createServiceGroupConfiguration(sqlite, { transaction, bumpVersion });
  const { selectGroups, ensureGroup, pageIdByName, pageOfGroup, pageForNewService } =
    groupConfiguration;
  const { createGroup, setGroupColumns, renameGroup, deleteGroup, reorderGroups } =
    groupConfiguration;

  const linkConfiguration = createServiceLinkConfiguration(sqlite, { transaction });
  const { selectLinks, selectServiceLinks, writeLinks } = linkConfiguration;

  const NEW_SERVICES_PRIVATE_KEY = 'new_services_allow_private';
  const transferOperations = createConfigurationTransfer({
    sqlite,
    transaction,
    selectServices,
    selectGroups,
    ensureGroup,
    nextServicePosition,
    bumpVersion,
    selectLinks,
    writeLinks,
    ensureType: linkConfiguration.ensureType,
  });
  const serviceCardOperations = createServiceCardConfiguration({
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
  });

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
      const links = selectLinks();
      return selectServices().map((row) => ({
        ...row,
        allowPrivate: Boolean(row.allowPrivate),
        checkInsecure: Boolean(row.checkInsecure),
        host: hosts.get(row.id) ?? null,
        links: links.get(row.id) ?? [],
      }));
    },
    listLinkTypes: linkConfiguration.listTypes,
    createLinkType: linkConfiguration.createType,
    updateLinkType: linkConfiguration.updateType,
    removeLinkType: linkConfiguration.removeType,
    /** Card-to-guest links by card id, for impact and suggestions. */
    listHosts: selectHosts,
    listMcpServices() {
      return sqlite
        .prepare(
          `SELECT s.id,s.name,s.url,s.category,s.description,
             (SELECT p.name FROM pages p WHERE p.id=COALESCE(g.page_id,(SELECT id FROM pages ORDER BY position,id LIMIT 1))) AS page
           FROM service_cards s LEFT JOIN service_groups g ON g.name=s.category ORDER BY s.category,s.name`,
        )
        .all();
    },
    findService: selectService,
    findAlias: (alias: string) =>
      sqlite.prepare('SELECT url FROM services WHERE alias=?').get(alias) as
        { url: string } | undefined,
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
      return hash(
        selectServices('id').map(({ checkUrl, checkInsecure, ...service }) => ({
          ...service,
          ...(checkUrl ? { checkUrl } : {}),
          ...(checkInsecure ? { checkInsecure: true } : {}),
        })),
      );
    },
    transaction,
    ...serviceCardOperations,
    ...transferOperations,
    createGroup,
    setGroupColumns,
    renameGroup,
    deleteGroup,
    reorderGroups,
  };
}
