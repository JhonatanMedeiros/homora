import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import { createDatabase, services } from '@homora/db';
import { validateService, type ServiceInput } from '@homora/shared';
import { createAuth } from './auth.js';
import { createVault, type ProxmoxConfig } from './vault.js';
import { ProxmoxError } from './proxmox.js';
import {
  createIntegrationRegistry,
  createObservationCache,
  IntegrationInvalidatedError,
  proxmoxAdapter,
} from './integrations.js';
type Database = ReturnType<typeof createDatabase>['db'];
export function createApp(
  db: Database,
  webPort: number,
  auth: ReturnType<typeof createAuth>,
  vault?: ReturnType<typeof createVault>,
) {
  const app = Fastify({ bodyLimit: 100_000 });
  const integrations = createIntegrationRegistry([proxmoxAdapter]);
  const proxmoxCache = createObservationCache<unknown>(30_000);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      ![`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`].includes(
        request.headers.origin ?? '',
      )
    )
      return reply.code(403).send({ error: 'Origem não autorizada.' });
  });
  app.get('/api/auth/status', async (request) => ({
    configured: auth.configured(),
    authenticated: auth.authorized(request.headers.cookie),
  }));
  app.post('/api/auth/setup', async (request, reply) => {
    if (auth.configured()) return reply.code(403).send({ error: 'Conta já configurada.' });
    try {
      auth.setup((request.body as { password?: unknown })?.password);
      return reply.code(201).send({ ok: true });
    } catch {
      return reply.code(400).send({
        error: 'Não foi possível criar a conta. Use uma senha com pelo menos 8 caracteres.',
      });
    }
  });
  app.post('/api/auth/login', async (request, reply) => {
    const token = auth.login((request.body as { password?: unknown })?.password, request.ip);
    if (!token)
      return reply.code(401).send({ error: 'Credenciais inválidas ou tentativas excedidas.' });
    return reply
      .header(
        'Set-Cookie',
        `homora_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
      )
      .send({ ok: true });
  });
  app.post('/api/auth/logout', async (request, reply) => {
    auth.logout(request.headers.cookie);
    return reply
      .header('Set-Cookie', 'homora_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
      .send({ ok: true });
  });
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith('/api/') &&
      !request.url.startsWith('/api/auth/') &&
      !auth.authorized(request.headers.cookie)
    )
      return reply.code(401).send({ error: 'Autenticação necessária.' });
  });
  app.get('/', async (_req, reply) => reply.redirect(`http://localhost:${webPort}/`));
  app.get('/api/integrations/catalog', async () => integrations.list());
  app.get('/api/proxmox/status', async () => {
    const config = vault?.load();
    return { configured: Boolean(config), hasCa: Boolean(config?.ca) };
  });
  function prepareConfig(body: unknown): ProxmoxConfig {
    if (!body || typeof body !== 'object') throw new Error('Dados inválidos.');
    const input = body as Record<string, unknown>;
    for (const key of ['url', 'tokenId', 'secret', 'ca']) {
      if (input[key] !== undefined && typeof input[key] !== 'string')
        throw new Error('Dados inválidos.');
    }
    if (input.removeCa !== undefined && typeof input.removeCa !== 'boolean')
      throw new Error('Dados inválidos.');
    const existing = vault?.load();
    if (existing && !input.secret) {
      let changedUrl = false;
      if (input.url) {
        try {
          changedUrl = new URL(input.url as string).origin !== existing.url;
        } catch {
          throw new Error('Informe uma URL HTTPS válida.');
        }
      }
      if (changedUrl || (input.tokenId && input.tokenId !== existing.tokenId))
        throw new Error('Informe novamente o segredo ao alterar a URL ou o ID do token.');
    }
    return proxmoxAdapter.validate({
      url: (input.url as string) || existing?.url || '',
      tokenId: (input.tokenId as string) || existing?.tokenId || '',
      secret: (input.secret as string) || existing?.secret || '',
      ca: input.removeCa ? undefined : (input.ca as string) || existing?.ca,
    });
  }
  app.post('/api/proxmox/config', async (request, reply) => {
    if (!vault) return reply.code(503).send({ error: 'Integração indisponível.' });
    let config: ProxmoxConfig;
    try {
      config = prepareConfig(request.body);
    } catch (error) {
      return reply.code(400).send({
        error:
          error instanceof Error && /^(Informe|Certificado|Dados)/.test(error.message)
            ? error.message
            : 'Não foi possível carregar a configuração existente.',
      });
    }
    try {
      await vault.save(config);
      proxmoxCache.invalidate();
      return { ok: true };
    } catch {
      return reply.code(500).send({ error: 'Não foi possível salvar a configuração.' });
    }
  });
  app.post('/api/proxmox/test', async (request, reply) => {
    if (!vault) return reply.code(503).send({ error: 'Integração indisponível.' });
    let config: ProxmoxConfig;
    try {
      config = prepareConfig(request.body);
    } catch (error) {
      return reply.code(400).send({
        error:
          error instanceof Error && /^(Informe|Certificado|Dados)/.test(error.message)
            ? error.message
            : 'Não foi possível carregar a configuração existente.',
      });
    }
    try {
      await proxmoxAdapter.collect(config);
      return { ok: true };
    } catch (error) {
      return reply.code(502).send({
        error: error instanceof ProxmoxError ? error.message : 'Não foi possível testar a conexão.',
      });
    }
  });
  app.get<{ Querystring: { refresh?: string } }>(
    '/api/proxmox/resources',
    async (request, reply) => {
      try {
        const config = vault?.load();
        if (!config) return reply.code(404).send({ error: 'Proxmox não configurado.' });
        return await proxmoxCache.collect(
          () => proxmoxAdapter.collect(config),
          request.query.refresh === 'true',
        );
      } catch (error) {
        return reply.code(502).send({
          error:
            error instanceof ProxmoxError || error instanceof IntegrationInvalidatedError
              ? error.message
              : 'Não foi possível carregar a configuração do Proxmox. Verifique os arquivos de integração e a chave.',
        });
      }
    },
  );
  app.get('/api/services', async () =>
    db.select().from(services).orderBy(services.category, services.name),
  );
  app.post('/api/services', async (request, reply) => {
    try {
      const service = validateService((request.body ?? {}) as Partial<ServiceInput>);
      const [created] = await db.insert(services).values(service).returning();
      return reply.code(201).send(created);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Dados inválidos.' });
    }
  });
  app.put<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    if (!/^\d+$/.test(request.params.id))
      return reply.code(404).send({ error: 'Serviço não encontrado.' });
    try {
      const service = validateService((request.body ?? {}) as Partial<ServiceInput>);
      const [updated] = await db
        .update(services)
        .set(service)
        .where(eq(services.id, Number(request.params.id)))
        .returning();
      return updated ?? reply.code(404).send({ error: 'Serviço não encontrado.' });
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Dados inválidos.' });
    }
  });
  app.delete<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    if (!/^\d+$/.test(request.params.id)) return reply.code(404).send({ deleted: false });
    const deleted = await db
      .delete(services)
      .where(eq(services.id, Number(request.params.id)))
      .returning();
    return reply.code(deleted.length ? 200 : 404).send({ deleted: Boolean(deleted.length) });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Não encontrado.' }));
  return app;
}
