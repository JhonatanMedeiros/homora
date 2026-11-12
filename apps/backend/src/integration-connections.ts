import { X509Certificate } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  createDatabase,
  getSqliteHandle,
  integrationInstances,
  integrationWidgets,
  services,
} from '@homora/db';
import { createVault, validateProxmoxConfig } from './vault.js';
import { getAuthorizedResponse } from './network-request.js';
import { createObservationCache } from './integrations.js';
import { integrationRegistry } from './integration-registry.js';
import { InputError } from './api-error.js';

type Db = ReturnType<typeof createDatabase>['db'];
type Vault = ReturnType<typeof createVault>;
type Row = typeof integrationInstances.$inferSelect;
type ConnectionInput = {
  type?: string;
  name?: string;
  url?: string;
  allowPrivate?: boolean;
  entityId?: string;
  username?: string;
  tokenId?: string;
  slug?: string;
  secret?: string;
  ca?: string;
  removeCa?: boolean;
};
type Credentials = { secret?: string; ca?: string; tokenId?: string };
type ConnectionData = {
  url: string;
  allowPrivate: boolean;
  entityId?: string;
  username?: string;
  slug?: string;
};
const connectionTypes = new Set(integrationRegistry.list().map(({ type }) => type));
const storedConfigSchema = z
  .object({
    url: z.string().max(2048),
    allowPrivate: z.boolean().default(false),
    entityId: z.string().max(255).optional(),
    username: z.string().max(255).optional(),
    slug: z.string().max(255).optional(),
  })
  .strict();
const credentialsSchema = z
  .object({
    secret: z.string().max(65536).optional(),
    ca: z.string().max(65536).optional(),
    tokenId: z.string().max(255).optional(),
  })
  .strict();
const widgetSchema = z
  .object({
    id: z.number(),
    integrationId: z.number(),
    type: z.string(),
    name: z.string(),
    publicConfig: z.string(),
    serviceId: z.number().nullable(),
  })
  .strict();

function validateCa(ca: string) {
  if (
    Buffer.byteLength(ca) > 65536 ||
    !/^\s*-----BEGIN CERTIFICATE-----[\r\n]+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(
      ca,
    )
  )
    throw new InputError('invalid-ca');
  try {
    if (!new X509Certificate(ca).ca) throw new Error();
  } catch {
    throw new InputError('invalid-ca');
  }
}

export function createIntegrationConnections(db: Db, vault?: Vault) {
  // The encrypted legacy file remains untouched as a backup. The marker prevents
  // re-importing a deliberately deleted connection on subsequent starts.
  function migrateLegacy(): number | null {
    if (!vault) return null;
    const sqlite = getSqliteHandle(db);
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const marker = sqlite
        .prepare("SELECT name FROM integration_migrations WHERE name LIKE 'legacy-proxmox:%'")
        .get() as { name: string } | undefined;
      if (marker) {
        sqlite.exec('COMMIT');
        const id = Number(marker.name.slice('legacy-proxmox:'.length));
        return Number.isSafeInteger(id) && id > 0 ? id : null;
      }
      const legacy = vault.load();
      if (!legacy) {
        sqlite.exec('COMMIT');
        return null;
      }
      const config = validateProxmoxConfig(legacy);
      const bridge = sqlite
        .prepare(
          "SELECT id FROM integration_instances WHERE type = 'proxmox' AND public_config = '{}' AND secret_ref IS NULL ORDER BY id LIMIT 1",
        )
        .get() as { id: number } | undefined;
      const data = JSON.stringify({ url: config.url, allowPrivate: true });
      const secret = vault.seal(
        JSON.stringify({
          secret: config.secret,
          tokenId: config.tokenId,
          ...(config.ca ? { ca: config.ca } : {}),
        }),
        false,
      );
      let id: number;
      if (bridge) {
        id = bridge.id;
        sqlite
          .prepare(
            'UPDATE integration_instances SET public_config = ?, secret_ref = ?, certificate_ref = ? WHERE id = ?',
          )
          .run(data, secret, config.ca ? 'both' : 'secret', id);
      } else {
        const result = sqlite
          .prepare(
            "INSERT INTO integration_instances(type, name, public_config, secret_ref, certificate_ref) VALUES ('proxmox', 'Proxmox VE', ?, ?, ?)",
          )
          .run(data, secret, config.ca ? 'both' : 'secret');
        id = Number(result.lastInsertRowid);
      }
      sqlite
        .prepare('INSERT INTO integration_migrations(name) VALUES (?)')
        .run(`legacy-proxmox:${id}`);
      sqlite.exec('COMMIT');
      return id;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  const caches = new Map<number, ReturnType<typeof createObservationCache<unknown>>>();
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
  function parseData(row: Row) {
    const parsed = storedConfigSchema.safeParse(JSON.parse(row.publicConfig));
    if (!parsed.success) throw new Error('Configuração da integração inválida.');
    return parsed.data;
  }
  function publicRow(row: Row) {
    const data = parseData(row);
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      ...data,
      hasSecret: row.certificateRef === 'secret' || row.certificateRef === 'both',
      hasCa: row.certificateRef === 'ca' || row.certificateRef === 'both',
    };
  }
  function credentials(row: Row): Credentials {
    if (!row.secretRef) return {};
    if (!vault) throw new Error('Cofre indisponível.');
    const parsed = credentialsSchema.safeParse(JSON.parse(vault.unseal(row.secretRef)));
    if (!parsed.success) throw new Error('Credenciais da integração inválidas.');
    return parsed.data;
  }
  function prepare(input: ConnectionInput, current?: Row, saved: Credentials = {}) {
    const old = current ? parseData(current) : undefined;
    const type = input.type || current?.type || '';
    const name = input.name || current?.name || '';
    if (!connectionTypes.has(type) || !name) throw new InputError('invalid-name-or-type');
    const data: ConnectionData = {
      url: input.url || old?.url || '',
      allowPrivate: input.allowPrivate ?? old?.allowPrivate ?? false,
      ...(type === 'home-assistant' ? { entityId: input.entityId || old?.entityId || '' } : {}),
      ...(type === 'adguard-home' ? { username: input.username || old?.username || '' } : {}),
      ...(type === 'uptime-kuma' ? { slug: input.slug || old?.slug || '' } : {}),
    };
    let originChanged = false;
    if (old) {
      try {
        originChanged = new URL(data.url).origin !== new URL(old.url).origin;
      } catch {
        throw new InputError('invalid-url');
      }
    }
    const identityChanged =
      !!current &&
      (current.type !== type ||
        originChanged ||
        (type === 'adguard-home' && old?.username !== data.username) ||
        (type === 'proxmox' && !!input.tokenId && saved.tokenId !== input.tokenId));
    if (identityChanged && saved.secret && !input.secret) throw new InputError('secret-required');
    const keys: Credentials = {
      secret: input.secret || (identityChanged ? undefined : saved.secret),
      tokenId:
        type === 'proxmox'
          ? input.tokenId || (originChanged ? undefined : saved.tokenId)
          : undefined,
      ca: input.removeCa ? undefined : input.ca || (identityChanged ? undefined : saved.ca),
    };
    if (keys.ca) validateCa(keys.ca);
    prepareAdapter(type, data, keys); // validates configuration without making a network request
    return { type, name, data, keys };
  }
  function prepareAdapter(type: string, data: ConnectionData, keys: Credentials) {
    const transport = async (request: { origin: string; path: string; authorization?: string }) => {
      const response = await getAuthorizedResponse(
        new URL(request.path, request.origin).href,
        { origins: [new URL(data.url).origin], allowPrivate: data.allowPrivate },
        {
          headers: request.authorization ? { authorization: request.authorization } : {},
          ca: keys.ca,
          ...(type === 'proxmox' ? { maxBodyBytes: 2_000_000 } : {}),
        },
      );
      let body: unknown = null;
      if (response.body) {
        try {
          body = JSON.parse(response.body) as unknown;
        } catch {
          throw new Error('Resposta JSON inválida.');
        }
      }
      return { status: response.status, body };
    };
    return integrationRegistry.prepare(type, {
      publicConfig: data,
      credentials: keys,
      transport,
    });
  }
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
    };
    const [result] = current
      ? await db
          .update(integrationInstances)
          .set(values)
          .where(eq(integrationInstances.id, current.id))
          .returning()
      : await db.insert(integrationInstances).values(values).returning();
    if (current) cacheFor(current.id).invalidate();
    return publicRow(result);
  }
  async function collect(id: number) {
    const row = await find(id);
    if (!row) return null;
    const data = parseData(row);
    const keys = credentials(row);
    return await prepareAdapter(row.type, data, keys)();
  }

  async function serviceExists(id: number) {
    return (
      (await db.select({ id: services.id }).from(services).where(eq(services.id, id))).length > 0
    );
  }

  return {
    async listConnections() {
      migrateLegacy();
      return (await db.select().from(integrationInstances))
        .filter((row) => row.type !== 'proxmox' || row.publicConfig !== '{}')
        .map(publicRow);
    },
    async listWidgets() {
      const rows = await db.select().from(integrationWidgets);
      return rows.map((row) => widgetSchema.parse(row));
    },
    async createWidget(
      target: { integrationId: number } | { source: 'proxmox' },
      name: string,
      serviceId: number | null = null,
    ) {
      const legacyId = migrateLegacy();
      if ('source' in target && legacyId === null) throw new InputError('proxmox-not-configured');
      const connection = await find('source' in target ? legacyId! : target.integrationId);
      if (!connection) return null;
      if (serviceId !== null && !(await serviceExists(serviceId)))
        return 'service-missing' as const;
      const [widget] = await db
        .insert(integrationWidgets)
        .values({
          integrationId: connection.id,
          type: connection.type,
          name,
          publicConfig: '{}',
          serviceId,
        })
        .returning();
      return widgetSchema.parse(widget);
    },
    async setWidgetService(id: number, serviceId: number | null) {
      if (serviceId !== null && !(await serviceExists(serviceId)))
        return 'service-missing' as const;
      const [widget] = await db
        .update(integrationWidgets)
        .set({ serviceId })
        .where(eq(integrationWidgets.id, id))
        .returning();
      return widget ? widgetSchema.parse(widget) : null;
    },
    async deleteWidget(id: number) {
      const rows = await db
        .delete(integrationWidgets)
        .where(eq(integrationWidgets.id, id))
        .returning();
      return rows.length > 0;
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
            .get(id)
        ) {
          sqlite.exec('COMMIT');
          return 'has-widgets' as const;
        }
        sqlite
          .prepare('UPDATE integration_migrations SET name=? WHERE name=?')
          .run('legacy-proxmox:deleted', `legacy-proxmox:${id}`);
        sqlite.prepare('DELETE FROM integration_instances WHERE id=?').run(id);
        sqlite.exec('COMMIT');
        caches.delete(id);
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
    async testConnection(id: number) {
      migrateLegacy();
      const row = await find(id);
      if (!row) return false;
      await collect(id);
      return true;
    },
  };
}
