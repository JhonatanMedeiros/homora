import type { FastifyInstance } from 'fastify';
import type { createVault, ProxmoxConfig } from '../vault.js';
import { ProxmoxError } from '../proxmox.js';
import {
  createObservationCache,
  IntegrationInvalidatedError,
  proxmoxAdapter,
} from '../integrations.js';
import { integrationRegistry } from '../integration-registry.js';
import { proxmoxInputSchema, refreshQuerySchema } from '../input-schemas.js';

type Vault = ReturnType<typeof createVault>;

export function registerProxmoxRoutes(app: FastifyInstance, vault?: Vault) {
  const cache = createObservationCache<unknown>(30_000);
  const collect = (config: ProxmoxConfig) =>
    integrationRegistry.prepare('proxmox', {
      publicConfig: {},
      credentials: {},
      legacyConfig: config,
    })();
  app.get('/api/proxmox/status', async () => {
    const config = vault?.load();
    return { configured: Boolean(config), hasCa: Boolean(config?.ca) };
  });

  function prepareConfig(body: unknown): ProxmoxConfig {
    const parsed = proxmoxInputSchema.safeParse(body);
    if (!parsed.success) throw new Error('Dados inválidos.');
    const input = parsed.data;
    const existing = vault?.load();
    if (existing && !input.secret) {
      let changedUrl = false;
      if (input.url) {
        try {
          changedUrl = new URL(input.url).origin !== existing.url;
        } catch {
          throw new Error('Informe uma URL HTTPS válida.');
        }
      }
      if (changedUrl || (input.tokenId && input.tokenId !== existing.tokenId))
        throw new Error('Informe novamente o segredo ao alterar a URL ou o ID do token.');
    }
    return proxmoxAdapter.validate({
      url: input.url || existing?.url || '',
      tokenId: input.tokenId || existing?.tokenId || '',
      secret: input.secret || existing?.secret || '',
      ca: input.removeCa ? undefined : input.ca || existing?.ca,
    });
  }

  const configError = (error: unknown) =>
    error instanceof Error && /^(Informe|Certificado|Dados)/.test(error.message)
      ? error.message
      : 'Não foi possível carregar a configuração existente.';

  app.post('/api/proxmox/config', async (request, reply) => {
    if (!vault) return reply.code(503).send({ error: 'Integração indisponível.' });
    let config: ProxmoxConfig;
    try {
      config = prepareConfig(request.body);
    } catch (error) {
      return reply.code(400).send({ error: configError(error) });
    }
    try {
      await vault.save(config);
      cache.invalidate();
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
      return reply.code(400).send({ error: configError(error) });
    }
    try {
      await collect(config);
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
        const query = refreshQuerySchema.safeParse(request.query);
        if (!query.success) return reply.code(400).send({ error: 'Consulta inválida.' });
        const config = vault?.load();
        if (!config) return reply.code(404).send({ error: 'Proxmox não configurado.' });
        return await cache.collect(() => collect(config), query.data.refresh === 'true');
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
}
