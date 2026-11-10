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
import { InputError, errorBody } from '../api-error.js';

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
    if (!parsed.success) throw new InputError('invalid-data');
    const input = parsed.data;
    const existing = vault?.load();
    if (existing && !input.secret) {
      let changedUrl = false;
      if (input.url) {
        try {
          changedUrl = new URL(input.url).origin !== existing.url;
        } catch {
          throw new InputError('https-url-required');
        }
      }
      if (changedUrl || (input.tokenId && input.tokenId !== existing.tokenId))
        throw new InputError('secret-required');
    }
    return proxmoxAdapter.validate({
      url: input.url || existing?.url || '',
      tokenId: input.tokenId || existing?.tokenId || '',
      secret: input.secret || existing?.secret || '',
      ca: input.removeCa ? undefined : input.ca || existing?.ca,
    });
  }

  const configError = (error: unknown) =>
    errorBody(error instanceof InputError ? error.code : 'proxmox-config-failed');

  app.post('/api/proxmox/config', async (request, reply) => {
    if (!vault) return reply.code(503).send(errorBody('integration-unavailable'));
    let config: ProxmoxConfig;
    try {
      config = prepareConfig(request.body);
    } catch (error) {
      return reply.code(400).send(configError(error));
    }
    try {
      await vault.save(config);
      cache.invalidate();
      return { ok: true };
    } catch {
      return reply.code(500).send(errorBody('proxmox-save-failed'));
    }
  });

  app.post('/api/proxmox/test', async (request, reply) => {
    if (!vault) return reply.code(503).send(errorBody('integration-unavailable'));
    let config: ProxmoxConfig;
    try {
      config = prepareConfig(request.body);
    } catch (error) {
      return reply.code(400).send(configError(error));
    }
    try {
      await collect(config);
      return { ok: true };
    } catch (error) {
      return reply
        .code(502)
        .send(errorBody(error instanceof ProxmoxError ? error.code : 'proxmox-test-failed'));
    }
  });

  app.get<{ Querystring: { refresh?: string } }>(
    '/api/proxmox/resources',
    async (request, reply) => {
      try {
        const query = refreshQuerySchema.safeParse(request.query);
        if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
        const config = vault?.load();
        if (!config) return reply.code(404).send(errorBody('proxmox-not-configured'));
        return await cache.collect(() => collect(config), query.data.refresh === 'true');
      } catch (error) {
        return reply
          .code(502)
          .send(
            errorBody(
              error instanceof ProxmoxError || error instanceof IntegrationInvalidatedError
                ? error.code
                : 'proxmox-load-failed',
            ),
          );
      }
    },
  );
}
