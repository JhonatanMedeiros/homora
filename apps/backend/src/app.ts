import Fastify from 'fastify';
import type { Service } from '@homora/shared';
import { createDatabase, getSqliteHandle, services } from '@homora/db';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
import {
  createServiceMonitor,
  startServiceMonitor,
  createObservationStore,
  createIncidentStore,
  createRollupStore,
  createMaintenanceStore,
} from './monitoring/index.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { createProposalService } from './proposals.js';
import { integrationRegistry } from './integration-registry.js';
import { createServiceConfiguration } from './service-configuration.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { createAuditLog } from './audit.js';
import { registerAgentProposalRoutes } from './routes/agent-proposals.js';
import type { DockerSource } from './discovery/index.js';
import { registerDiscoveryRoutes } from './routes/discovery.js';
import { registerConfigTransferRoutes } from './routes/config-transfer.js';
import { registerServiceConfigurationRoutes } from './routes/service-configuration.js';
import { errorBody } from './api-error.js';
import { createTagStore } from './service-tags.js';
import { registerServiceTagRoutes } from './routes/service-tags.js';
import { registerServiceMaintenanceRoutes } from './routes/service-maintenance.js';
import { createDockerPush } from './discovery/index.js';
import { registerDockerPushRoutes } from './routes/docker-push.js';
import { registerMcpHttp } from './mcp-http.js';
import { createPublicStatus } from './public-status.js';
import { PUBLIC_STATUS_PATH, registerPublicStatusRoutes } from './routes/public-status.js';
import { registerServiceIncidentRoutes } from './routes/service-incidents.js';
import { createNotifications } from './notifications.js';
import { registerHostSuggestionRoutes } from './routes/host-suggestions.js';
import { registerResourceLinkRoutes } from './routes/resource-links.js';
import { registerServiceDependencyRoutes } from './routes/service-dependencies.js';
import { createCustomCss } from './custom-css.js';
import { registerCustomCssRoutes } from './routes/custom-css.js';
import { createPages } from './pages.js';
import { registerPageRoutes } from './routes/pages.js';
import { createAppearance } from './appearance.js';
import { createBackgroundStore } from './background-image.js';
import { registerAppearanceRoutes } from './routes/appearance.js';
import { registerNotificationRoutes } from './routes/notifications.js';

type Database = ReturnType<typeof createDatabase>['db'];

export function createApp(
  db: Database,
  webPort: number,
  auth: ReturnType<typeof createAuth>,
  vault?: ReturnType<typeof createVault>,
  configuredOrigins: readonly string[] = [],
  dockerSource?: DockerSource,
  /**
   * `trustProxy` extracts client IP from `X-Forwarded-For` (used for login rate limiting).
   * Enable only when all traffic traverses a reverse proxy that OVERWRITES this header,
   * such as Compose's nginx; otherwise any client could spoof it.
   */
  options: {
    trustProxy?: boolean;
    apiPort?: number;
    backgroundPath?: string;
    developmentMocks?: boolean;
  } = {},
) {
  const app = Fastify({ bodyLimit: 100_000, trustProxy: options.trustProxy === true });
  const sqlite = getSqliteHandle(db);
  const configuration = createServiceConfiguration(sqlite);
  const audit = createAuditLog(sqlite);
  const appearance = createAppearance(sqlite);
  const customCss = createCustomCss(sqlite);
  const proposals = createProposalService(sqlite, configuration);
  const rollup = createRollupStore(sqlite);
  const observations = createObservationStore(sqlite, rollup);
  const notifications = createNotifications(sqlite, vault);
  const incidents = createIncidentStore(sqlite);
  const maintenance = createMaintenanceStore(sqlite);
  const tagStore = createTagStore(sqlite);
  // An old backend process may have stopped without clearing its last observation.
  observations.clear();
  const serviceMonitor = createServiceMonitor(
    () => db.select().from(services).orderBy(services.id) as Promise<Service[]>,
    undefined,
    undefined,
    (rows, states) => {
      try {
        observations.publish(rows, states);
        notifications.publish(rows, states);
        incidents.observe(rows, states);
      } catch {
        /* Keep the dashboard usable on storage errors. */
      }
    },
    (at) => {
      try {
        return new Set(maintenance.active(at).keys());
      } catch {
        return new Set<number>();
      }
    },
  );
  try {
    rollup.backfill();
  } catch {
    /* The long-range charts stay empty; checks keep working. */
  }
  const publicStatus = createPublicStatus(sqlite, observations);
  try {
    incidents.rebuildFromHistory(
      sqlite
        .prepare(
          'SELECT id,url,allow_private AS allowPrivate,check_type AS checkType,check_interval AS checkInterval,expected_status AS expectedStatus,check_path AS checkPath,check_match AS checkMatch FROM services',
        )
        .all() as unknown as Service[],
    );
  } catch {
    /* Incidents are auxiliary: the dashboard stays usable without them. */
  }
  const stopServiceMonitor = startServiceMonitor(serviceMonitor);
  app.addHook('onClose', async () => {
    stopServiceMonitor();
    await notifications.stop();
  });

  const allowedOrigins = new Set([
    `http://127.0.0.1:${webPort}`,
    `http://localhost:${webPort}`,
    ...configuredOrigins,
  ]);
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
    if (
      request.url.split('?')[0] !== '/mcp' &&
      request.url.split('?')[0] !== '/docker-push/inventory' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !allowedOrigins.has(request.headers.origin ?? '')
    )
      return reply.code(403).send(errorBody('origin-not-allowed'));
  });
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.url.startsWith('/api/') &&
      !request.url.startsWith('/api/auth/') &&
      // The one anonymous exception: exact path, read-only.
      !(request.method === 'GET' && request.url.split('?')[0] === PUBLIC_STATUS_PATH) &&
      !(await auth.session(request.headers))
    )
      return reply.code(401).send(errorBody('auth-required'));
  });

  registerMcpHttp(
    app,
    sqlite,
    proposals,
    vault,
    db,
    dockerSource,
    allowedOrigins,
    options.apiPort ?? 3000,
  );

  app.get('/', async (_req, reply) => reply.redirect(`http://localhost:${webPort}/`));
  registerAuthRoutes(app, auth, webPort, audit);
  registerAccountRoutes(app, auth, audit);
  app.get('/api/integrations/catalog', async () => integrationRegistry.describe());
  const connections = registerConnectionRoutes(app, db, vault, options.developmentMocks === true);
  registerNotificationRoutes(app, notifications);
  registerPageRoutes(app, createPages(sqlite), auth, audit);
  registerCustomCssRoutes(app, customCss, auth, audit);
  registerAppearanceRoutes(
    app,
    appearance,
    auth,
    audit,
    options.backgroundPath ? createBackgroundStore(options.backgroundPath) : undefined,
  );
  registerAgentProposalRoutes(app, proposals, serviceMonitor, auth, audit);
  registerPublicStatusRoutes(app, publicStatus, auth, audit);
  registerServiceIncidentRoutes(app, incidents, observations, auth, audit);
  registerServiceMaintenanceRoutes(app, maintenance, serviceMonitor, auth, audit);
  registerServiceTagRoutes(app, tagStore);
  registerServiceConfigurationRoutes(
    app,
    configuration,
    serviceMonitor,
    observations,
    publicStatus,
    auth,
    audit,
  );
  registerHostSuggestionRoutes(app, sqlite, connections, configuration);
  registerServiceDependencyRoutes(app, sqlite, auth, audit);
  registerResourceLinkRoutes(app, sqlite, auth, audit);
  registerConfigTransferRoutes(app, configuration, serviceMonitor, {
    appearance,
    customCss,
  });
  registerDiscoveryRoutes(app, configuration, serviceMonitor, dockerSource);
  registerDockerPushRoutes(app, createDockerPush(sqlite), configuration, serviceMonitor, auth);

  app.setErrorHandler((error, _request, reply) => {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status >= 500) return reply.code(status).send(errorBody('internal-error'));
    return reply.send(error);
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send(errorBody('not-found')));
  return app;
}
