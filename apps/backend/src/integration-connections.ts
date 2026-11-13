import { eq } from 'drizzle-orm';
import { createDatabase, getSqliteHandle, integrationInstances } from '@homora/db';
import { createVault } from './vault.js';
import {
  migrateLegacyConnections,
  markLegacyConnectionDeleted,
  isHiddenLegacyConnection,
} from './legacy-integrations.js';
import { createObservationCache } from './integrations.js';
import { integrationRegistry } from './integration-registry.js';
import { createIntegrationWidgets } from './integration-widgets.js';
import { createIntegrationTransport } from './integration-transport.js';
import {
  parseConnectionData,
  prepareConnection,
  publicConnection,
  readConnectionCredentials,
  testFailureReason,
  type ConnectionData,
  type ConnectionInput,
  type Credentials,
} from './integration-connection-config.js';

type Db = ReturnType<typeof createDatabase>['db'];
type Vault = ReturnType<typeof createVault>;
type Row = typeof integrationInstances.$inferSelect;
const BACKOFF_MIN_MS = 60_000;
const BACKOFF_MAX_MS = 900_000;

export function createIntegrationConnections(
  db: Db,
  vault?: Vault,
  clock: () => number = Date.now,
) {
  /**
   * An integration may request a pause after an error. Automatic reads then stop for at least
   * 60 s, or the requested delay when longer (at most 15 min), and fail without touching the
   * network. In memory, per
   * connection, cleared when the connection is edited or a read succeeds. It never stores a
   * success: this is the one deliberate exception to "retry on every request".
   */
  const backoffs = new Map<number, number>();
  const sessionTransports = new Map<
    number,
    { revision: string; transport: ReturnType<typeof createIntegrationTransport> }
  >();
  async function guarded<T>(row: Row, run: () => Promise<T>, bypass = false): Promise<T> {
    const retryDelaySeconds = integrationRegistry.get(row.type)?.retryDelaySeconds;
    if (!retryDelaySeconds) return run();
    const until = backoffs.get(row.id);
    if (!bypass && until !== undefined && until > clock())
      throw new Error('Integration temporarily unavailable.');
    try {
      const result = await run();
      backoffs.delete(row.id);
      return result;
    } catch (error) {
      const retryDelay = retryDelaySeconds(error);
      if (retryDelay !== null) {
        const wait = Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, retryDelay * 1000));
        backoffs.set(row.id, clock() + wait);
      }
      throw error;
    }
  }
  const migrateLegacy = () => migrateLegacyConnections(db, vault);
  const caches = new Map<number, ReturnType<typeof createObservationCache<unknown>>>();
  const addressCaches = new Map<number, ReturnType<typeof createObservationCache<unknown>>>();
  const inventoryCaches = new Map<number, ReturnType<typeof createObservationCache<unknown>>>();
  const cacheFor = (id: number) => {
    let cache = caches.get(id);
    if (!cache) {
      cache = createObservationCache<unknown>(30_000);
      caches.set(id, cache);
    }
    return cache;
  };
  async function find(id: number) {
    return (await db.select().from(integrationInstances).where(eq(integrationInstances.id, id)))[0];
  }
  function prepareAdapter(
    type: string,
    data: ConnectionData,
    keys: Credentials,
    detail = false,
    id?: number,
    revision?: string,
  ) {
    const auth = integrationRegistry.get(type)?.sessionAuth;
    const cached = id !== undefined && auth ? sessionTransports.get(id) : undefined;
    let transport = cached?.revision === revision ? cached?.transport : undefined;
    if (!transport) {
      transport = createIntegrationTransport(data, keys, 'error', undefined, auth);
      if (id !== undefined && auth && revision !== undefined)
        sessionTransports.set(id, { revision, transport });
    }
    const context = { publicConfig: data, credentials: keys, transport };
    return detail
      ? integrationRegistry.prepareInventory(type, context)
      : integrationRegistry.prepare(type, context);
  }
  const parseData = parseConnectionData;
  const publicRow = publicConnection;
  const credentials = (row: Row) => readConnectionCredentials(row, vault);
  const prepare = (input: ConnectionInput, current?: Row, saved: Credentials = {}) =>
    prepareConnection(input, current, saved, (type, data, keys) =>
      prepareAdapter(type, data, keys),
    );

  async function save(input: ConnectionInput, current?: Row) {
    if (!vault) throw new Error('Cofre indisponível.');
    const saved = current ? credentials(current) : {};
    const value = prepare(input, current, saved);
    const existingRows = await db.select().from(integrationInstances);
    const hasEncrypted =
      existingRows.some((row) => row.secretRef !== null) ||
      Boolean(getSqliteHandle(db).prepare('SELECT 1 FROM notification_channels LIMIT 1').get());
    const hasSecret = Boolean(value.keys.secret);
    const hasCa = Boolean(value.keys.ca);
    const secretRef =
      hasSecret || hasCa ? vault.seal(JSON.stringify(value.keys), !hasEncrypted) : null;
    const values = {
      type: value.type,
      name: value.name,
      publicConfig: JSON.stringify(value.data),
      secretRef,
      certificateRef: hasSecret && hasCa ? 'both' : hasSecret ? 'secret' : hasCa ? 'ca' : null,
      // A changed connection has not been tested yet.
      lastTestAt: null,
      lastTestResult: null,
    };
    const [result] = current
      ? await db
          .update(integrationInstances)
          .set(values)
          .where(eq(integrationInstances.id, current.id))
          .returning()
      : await db.insert(integrationInstances).values(values).returning();
    if (current) {
      cacheFor(current.id).invalidate();
      inventoryCaches.get(current.id)?.invalidate();
      addressCaches.get(current.id)?.invalidate();
      backoffs.delete(current.id);
      sessionTransports.delete(current.id);
    }
    return publicRow(result);
  }
  async function collect(id: number, bypass = false) {
    const row = await find(id);
    if (!row) return null;
    const data = parseData(row);
    const keys = credentials(row);
    const revision = JSON.stringify([
      row.type,
      row.publicConfig,
      row.secretRef,
      row.certificateRef,
    ]);
    return guarded(
      row,
      () => prepareAdapter(row.type, data, keys, false, row.id, revision)(),
      bypass,
    );
  }

  const widgets = createIntegrationWidgets(db, find, migrateLegacy);

  return {
    migrateLegacy,
    ...widgets,
    async listConnections() {
      migrateLegacy();
      return (await db.select().from(integrationInstances))
        .filter((row) => !isHiddenLegacyConnection(row))
        .map(publicRow);
    },
    createConnection(input: ConnectionInput) {
      migrateLegacy();
      return save(input);
    },
    async updateConnection(id: number, input: ConnectionInput) {
      migrateLegacy();
      const current = await find(id);
      return current ? save(input, current) : null;
    },
    async deleteConnection(id: number) {
      migrateLegacy();
      const sqlite = getSqliteHandle(db);
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        if (!sqlite.prepare('SELECT id FROM integration_instances WHERE id=?').get(id)) {
          sqlite.exec('COMMIT');
          return 'missing' as const;
        }
        if (
          sqlite
            .prepare('SELECT id FROM integration_widgets WHERE integration_id=? LIMIT 1')
            .get(id) ||
          sqlite.prepare('SELECT id FROM page_widgets WHERE connection_id=? LIMIT 1').get(id)
        ) {
          sqlite.exec('COMMIT');
          return 'has-widgets' as const;
        }
        markLegacyConnectionDeleted(sqlite, id);
        sqlite.prepare('DELETE FROM integration_instances WHERE id=?').run(id);
        sqlite.exec('COMMIT');
        caches.delete(id);
        backoffs.delete(id);
        sessionTransports.delete(id);
        inventoryCaches.delete(id);
        addressCaches.delete(id);
        return 'deleted' as const;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    async connectionData(id: number, refresh = false) {
      migrateLegacy();
      const row = await find(id);
      if (!row) return null;
      return cacheFor(id).collect(async () => {
        const data = await collect(id);
        if (data === null) throw new Error('Integration not found.');
        return data;
      }, refresh);
    },
    /**
     * Names and ids of nodes and guests, cached for 30 s like the summary. Returns null when the
     * connection is missing and 'unsupported-inventory' when it cannot provide host inventory.
     */
    async inventoryData(id: number, refresh = false) {
      migrateLegacy();
      const row = await find(id);
      if (!row) return null;
      if (integrationRegistry.get(row.type)?.inventoryDomain !== 'hosts')
        return 'unsupported-inventory' as const;
      let cache = inventoryCaches.get(id);
      if (!cache) {
        cache = createObservationCache<unknown>(30_000);
        inventoryCaches.set(id, cache);
      }
      return cache.collect(
        () => prepareAdapter(row.type, parseData(row), credentials(row), true)(),
        refresh,
      );
    },
    /**
     * Applications and services with names, IDs and addresses, cached for 30 s like the summary.
     * Returns null when the connection is missing and 'unsupported-inventory' for
     * other types. Authenticated callers only; never part of MCP or the public status page.
     */
    async resourcesData(id: number, refresh = false) {
      migrateLegacy();
      const row = await find(id);
      if (!row) return null;
      if (integrationRegistry.get(row.type)?.inventoryDomain !== 'resources')
        return 'unsupported-inventory' as const;
      let cache = inventoryCaches.get(id);
      if (!cache) {
        cache = createObservationCache<unknown>(30_000);
        inventoryCaches.set(id, cache);
      }
      return cache.collect(
        () =>
          guarded(row, () => prepareAdapter(row.type, parseData(row), credentials(row), true)()),
        refresh,
      );
    },
    /**
     * Static and guest-agent addresses of the given guests (suggestion evidence), cached 5 min per
     * connection. Same audience as the inventory: authenticated callers only.
     */
    async addressData(id: number, guests: readonly unknown[]) {
      migrateLegacy();
      const row = await find(id);
      if (!row || !integrationRegistry.get(row.type)?.prepareAddresses) return null;
      let cache = addressCaches.get(id);
      if (!cache) {
        cache = createObservationCache<unknown>(300_000);
        addressCaches.set(id, cache);
      }
      const data = parseData(row);
      const keys = credentials(row);
      const transport = createIntegrationTransport(data, keys, 'empty', 2_000_000);
      return cache.collect(() =>
        integrationRegistry.prepareAddresses(row.type, {
          publicConfig: data,
          credentials: keys,
          transport,
        })(guests),
      );
    },
    async testConnection(id: number) {
      migrateLegacy();
      const row = await find(id);
      if (!row) return false;
      const record = (lastTestResult: string) =>
        db
          .update(integrationInstances)
          .set({ lastTestAt: clock(), lastTestResult })
          .where(eq(integrationInstances.id, id));
      try {
        await collect(id, true); // the explicit test ignores a backoff but still records a new one
      } catch (error) {
        await record(testFailureReason(error));
        throw error;
      }
      await record('ok');
      return true;
    },
  };
}
