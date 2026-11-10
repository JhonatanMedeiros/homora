import type { FastifyInstance } from 'fastify';
import { X509Certificate } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDatabase, integrationInstances, integrationWidgets } from '@homora/db';
import { createVault } from './vault.js';
import { getAuthorizedResponse } from './network-request.js';
import { createObservationCache } from './integrations.js';
import { integrationRegistry } from './integration-registry.js';

type Db = ReturnType<typeof createDatabase>['db'];
type Vault = ReturnType<typeof createVault>;
type Data = {
  url: string;
  allowPrivate: boolean;
  entityId?: string;
  username?: string;
  slug?: string;
};
type Credentials = { secret?: string; ca?: string };
type Row = typeof integrationInstances.$inferSelect;
const types = new Set(
  integrationRegistry
    .list()
    .filter(({ type }) => type !== 'proxmox')
    .map(({ type }) => type),
);
function parseData(row: Row): Data {
  return JSON.parse(row.publicConfig) as Data;
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
function validateCa(ca: string) {
  if (
    Buffer.byteLength(ca) > 65536 ||
    !/^\s*-----BEGIN CERTIFICATE-----[\r\n]+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(
      ca,
    )
  )
    throw new Error('Certificado de CA inválido.');
  try {
    if (!new X509Certificate(ca).ca) throw new Error();
  } catch {
    throw new Error('Certificado de CA inválido.');
  }
}
function credentials(row: Row, vault: Vault): Credentials {
  return row.secretRef ? (JSON.parse(vault.unseal(row.secretRef)) as Credentials) : {};
}
function adapter(type: string, data: Data, keys: Credentials) {
  const transport = async (request: { origin: string; path: string; authorization?: string }) => {
    const response = await getAuthorizedResponse(
      new URL(request.path, request.origin).href,
      { origins: [new URL(data.url).origin], allowPrivate: data.allowPrivate },
      {
        headers: request.authorization ? { authorization: request.authorization } : {},
        ca: keys.ca,
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
    publicConfig: { ...data },
    credentials: keys,
    transport,
  });
}
function prepare(body: unknown, current?: Row, saved: Credentials = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Dados inválidos.');
  const input = body as Record<string, unknown>;
  const allowed = [
    'type',
    'name',
    'url',
    'allowPrivate',
    'entityId',
    'username',
    'slug',
    'secret',
    'ca',
    'removeCa',
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('Dados inválidos.');
  for (const key of ['type', 'name', 'url', 'entityId', 'username', 'slug', 'secret', 'ca'])
    if (input[key] !== undefined && typeof input[key] !== 'string')
      throw new Error('Dados inválidos.');
  if (
    (input.allowPrivate !== undefined && typeof input.allowPrivate !== 'boolean') ||
    (input.removeCa !== undefined && typeof input.removeCa !== 'boolean')
  )
    throw new Error('Dados inválidos.');
  const old = current ? parseData(current) : undefined;
  const type = (input.type as string) || current?.type || '';
  const name = ((input.name as string) || current?.name || '').trim();
  if (!types.has(type) || !name || name.length > 80)
    throw new Error('Informe nome e tipo válidos.');
  const data: Data = {
    url: (input.url as string) || old?.url || '',
    allowPrivate: (input.allowPrivate as boolean | undefined) ?? old?.allowPrivate ?? false,
  };
  if (type === 'home-assistant') data.entityId = (input.entityId as string) || old?.entityId || '';
  if (type === 'adguard-home') data.username = (input.username as string) || old?.username || '';
  if (type === 'uptime-kuma') data.slug = (input.slug as string) || old?.slug || '';
  let originChanged = false;
  if (old) {
    try {
      originChanged = new URL(data.url).origin !== new URL(old.url).origin;
    } catch {
      throw new Error('Informe uma URL válida.');
    }
  }
  const identityChanged =
    !!current &&
    (current.type !== type ||
      originChanged ||
      (type === 'adguard-home' && old?.username !== data.username));
  const suppliedSecret = input.secret as string | undefined;
  if (identityChanged && saved.secret && !suppliedSecret)
    throw new Error('Informe novamente o segredo ao alterar a origem, tipo ou usuário.');
  const keys: Credentials = {
    secret: suppliedSecret || (identityChanged ? undefined : saved.secret),
    ca: input.removeCa
      ? undefined
      : (input.ca as string) || (identityChanged ? undefined : saved.ca),
  };
  if (keys.ca) validateCa(keys.ca);
  adapter(type, data, keys); // validate only; performs no network request
  return { type, name, data, keys };
}
export function registerConnectionRoutes(app: FastifyInstance, db: Db, vault?: Vault) {
  const caches = new Map<number, ReturnType<typeof createObservationCache<unknown>>>();
  function cacheFor(id: number) {
    let cache = caches.get(id);
    if (!cache) {
      cache = createObservationCache<unknown>(30_000);
      caches.set(id, cache);
    }
    return cache;
  }
  async function find(id: string) {
    if (!/^\d+$/.test(id)) return undefined;
    return (
      await db
        .select()
        .from(integrationInstances)
        .where(eq(integrationInstances.id, Number(id)))
    )[0];
  }
  app.get('/api/connections', async () =>
    (await db.select().from(integrationInstances)).map(publicRow),
  );
  app.get('/api/widgets', async () => db.select().from(integrationWidgets));
  app.post('/api/widgets', async (request, reply) => {
    const input = request.body as { integrationId?: unknown; name?: unknown } | null;
    if (
      !input ||
      !Number.isSafeInteger(input.integrationId) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 80
    )
      return reply.code(400).send({ error: 'Informe integração e nome válidos.' });
    const connection = await find(String(input.integrationId));
    if (!connection) return reply.code(404).send({ error: 'Integração não encontrada.' });
    const [widget] = await db
      .insert(integrationWidgets)
      .values({
        integrationId: connection.id,
        type: connection.type,
        name: input.name.trim(),
        publicConfig: '{}',
      })
      .returning();
    return reply.code(201).send(widget);
  });
  app.delete<{ Params: { id: string } }>('/api/widgets/:id', async (request, reply) => {
    if (!/^\d+$/.test(request.params.id))
      return reply.code(404).send({ error: 'Widget não encontrado.' });
    const rows = await db
      .delete(integrationWidgets)
      .where(eq(integrationWidgets.id, Number(request.params.id)))
      .returning();
    return rows.length ? { ok: true } : reply.code(404).send({ error: 'Widget não encontrado.' });
  });
  async function write(body: unknown, current?: Row) {
    if (!vault) throw new Error('Cofre indisponível.');
    const saved = current ? credentials(current, vault) : {};
    const value = prepare(body, current, saved);
    const rows = await db.select().from(integrationInstances);
    const hasEncrypted = rows.some((row) => row.secretRef !== null);
    const hasSecret = Boolean(value.keys.secret),
      hasCa = Boolean(value.keys.ca);
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
  app.post('/api/connections', async (request, reply) => {
    try {
      return reply.code(201).send(await write(request.body));
    } catch (error) {
      return reply.code(400).send({
        error:
          error instanceof Error && /^(Informe|Certificado|Dados|Tipo)/.test(error.message)
            ? error.message
            : 'Não foi possível salvar a integração.',
      });
    }
  });
  app.put<{ Params: { id: string } }>('/api/connections/:id', async (request, reply) => {
    const row = await find(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Integração não encontrada.' });
    try {
      return await write(request.body, row);
    } catch (error) {
      return reply.code(400).send({
        error:
          error instanceof Error && /^(Informe|Certificado|Dados|Tipo)/.test(error.message)
            ? error.message
            : 'Não foi possível salvar a integração.',
      });
    }
  });
  app.delete<{ Params: { id: string } }>('/api/connections/:id', async (request, reply) => {
    const row = await find(request.params.id);
    if (!row) return reply.code(404).send({ error: 'Integração não encontrada.' });
    const widgets = await db
      .select()
      .from(integrationWidgets)
      .where(eq(integrationWidgets.integrationId, row.id));
    if (widgets.length)
      return reply
        .code(409)
        .send({ error: 'Remova os widgets vinculados antes de excluir a integração.' });
    await db.delete(integrationInstances).where(eq(integrationInstances.id, row.id));
    caches.delete(row.id);
    return { ok: true };
  });
  async function fetchData(id: string) {
    const row = await find(id);
    if (!row) return null;
    if (!vault) throw new Error('Cofre indisponível.');
    const data = parseData(row);
    const keys = credentials(row, vault);
    return await adapter(row.type, data, keys)();
  }
  app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    '/api/connections/:id/data',
    async (request, reply) => {
      try {
        const id = Number(request.params.id);
        if (!Number.isSafeInteger(id) || id < 1)
          return reply.code(404).send({ error: 'Integração não encontrada.' });
        if (!(await find(request.params.id)))
          return reply.code(404).send({ error: 'Integração não encontrada.' });
        const result = await cacheFor(id).collect(async () => {
          const data = await fetchData(request.params.id);
          if (data === null) throw new Error('Integração não encontrada.');
          return data;
        }, request.query.refresh === 'true');
        return result ?? reply.code(404).send({ error: 'Integração não encontrada.' });
      } catch {
        return reply.code(502).send({
          error:
            'Não foi possível consultar a integração. Verifique conexão, permissões e certificado.',
        });
      }
    },
  );
  app.post<{ Params: { id: string } }>('/api/connections/:id/test', async (request, reply) => {
    try {
      const result = await fetchData(request.params.id);
      return result ? { ok: true } : reply.code(404).send({ error: 'Integração não encontrada.' });
    } catch {
      return reply.code(502).send({
        error: 'Não foi possível testar a integração. Verifique conexão, permissões e certificado.',
      });
    }
  });
}
