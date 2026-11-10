import Fastify from 'fastify';
import type { Service } from '@homora/shared';
import { createDatabase, getSqliteHandle, services } from '@homora/db';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
import { createServiceMonitor, startServiceMonitor } from './service-monitor.js';
import { registerConnectionRoutes } from './connections.js';
import { createProposalService } from './proposals.js';
import { integrationRegistry } from './integration-registry.js';
import { createServiceConfiguration } from './service-configuration.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAgentProposalRoutes } from './routes/agent-proposals.js';
import { registerProxmoxRoutes } from './routes/proxmox.js';
import { registerServiceConfigurationRoutes } from './routes/service-configuration.js';

type Database = ReturnType<typeof createDatabase>['db'];

export function createApp(
  db: Database,
  webPort: number,
  auth: ReturnType<typeof createAuth>,
  vault?: ReturnType<typeof createVault>,
  configuredOrigins: readonly string[] = [],
) {
  const app = Fastify({ bodyLimit: 100_000 });
  const sqlite = getSqliteHandle(db);
  const configuration = createServiceConfiguration(sqlite);
  const proposals = createProposalService(sqlite, configuration);
  const serviceMonitor = createServiceMonitor(
    () => db.select().from(services).orderBy(services.id) as Promise<Service[]>,
  );
  const stopServiceMonitor = startServiceMonitor(serviceMonitor);
  app.addHook('onClose', async () => stopServiceMonitor());

  const allowedOrigins = new Set([
    `http://127.0.0.1:${webPort}`,
    `http://localhost:${webPort}`,
    ...configuredOrigins,
  ]);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !allowedOrigins.has(request.headers.origin ?? '')
    )
      return reply.code(403).send({ error: 'Origem não autorizada.' });
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
  registerAuthRoutes(app, auth);
  app.get('/api/integrations/catalog', async () => integrationRegistry.list());
  registerConnectionRoutes(app, db, vault);
  registerProxmoxRoutes(app, vault);
  registerAgentProposalRoutes(app, proposals);
  registerServiceConfigurationRoutes(app, configuration, serviceMonitor);

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Não encontrado.' }));
  return app;
}
