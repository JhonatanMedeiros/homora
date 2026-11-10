import type { FastifyInstance } from 'fastify';
import type { createVault, ProxmoxConfig } from '../vault.js';
import { ProxmoxError } from '../proxmox.js';
import {
  createObservationCache,
  IntegrationInvalidatedError,
  proxmoxAdapter,
} from '../integrations.js';
import { integrationRegistry } from '../integration-registry.js';

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
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new Error('Dados inválidos.');
    const input = body as Record<string, unknown>;
    for (const key of ['url', 'tokenId', 'secret', 'ca'])
      if (input[key] !== undefined && typeof input[key] !== 'string')
        throw new Error('Dados inválidos.');
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
        const config = vault?.load();
        if (!config) return reply.code(404).send({ error: 'Proxmox não configurado.' });
        return await cache.collect(() => collect(config), request.query.refresh === 'true');
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
