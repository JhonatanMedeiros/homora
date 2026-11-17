import { registerWidgetMonitoringRoutes } from './routes/widget-monitoring.js';
import { registerPageWidgetRoutes } from './routes/page-widgets.js';
import Fastify, { LogController, type FastifyBaseLogger, type FastifyServerOptions } from 'fastify';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
import {
  createDegradedSince,
  createServiceMonitor,
  startServiceMonitor,
  createObservationStore,
  createIncidentStore,
  createMeasurementGuard,
  createRollupStore,
  createMaintenanceStore,
  createMonitoringSource,
} from './monitoring/index.js';
import { registerConnectionRoutes } from './routes/connections.js';
import { createProposalService } from './proposals/index.js';
import { integrationRegistry } from './integrations/integration-registry.js';
import { createServiceConfiguration } from './service-configuration.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAccountRoutes } from './routes/account.js';
import { createAuditLog, SYSTEM_ACTOR } from './audit.js';
import { registerAgentProposalRoutes } from './routes/agent-proposals.js';
import type { DockerSource } from './discovery/index.js';
import { registerDiscoveryRoutes } from './routes/discovery.js';
import { registerConfigTransferRoutes } from './routes/config-transfer.js';
import { registerServiceConfigurationRoutes } from './routes/service-configuration.js';
import { errorBody } from './api-error.js';
import { buildInfo, isQuietRequest } from './logger.js';
import { createServiceAttention } from './service-attention.js';
import { createTagStore } from './service-tags.js';
import { registerServiceTagRoutes } from './routes/service-tags.js';
import { registerServiceLinkTypeRoutes } from './routes/service-link-types.js';
import { registerServiceMaintenanceRoutes } from './routes/service-maintenance.js';
import { createDockerPush } from './discovery/index.js';
import { registerDockerPushRoutes } from './routes/docker-push.js';
import { registerMcpHttp } from './mcp/http.js';
import { createPublicStatus } from './public-status.js';
import { PUBLIC_STATUS_PATH, registerPublicStatusRoutes } from './routes/public-status.js';
import { registerServiceIncidentRoutes } from './routes/service-incidents.js';
import { createNotifications } from './notifications/index.js';
import { createInbox } from './inbox.js';
import { registerInboxRoutes } from './routes/inbox.js';
import { registerHostSuggestionRoutes } from './routes/host-suggestions.js';
import { registerResourceLinkRoutes } from './routes/resource-links.js';
import { registerServiceDependencyRoutes } from './routes/service-dependencies.js';
import { createCustomCss } from './custom-css.js';
import { registerCustomCssRoutes } from './routes/custom-css.js';
import { createPages } from './pages.js';
import { registerPageRoutes } from './routes/pages.js';
import { registerProbeRoutes } from './routes/probes.js';
import { createProbeStore } from './probes.js';
import { createAppearance } from './appearance.js';
import { createBackgroundStore } from './background-image.js';
import { createReleaseNotes } from './release-notes.js';
import { DEMO_RELEASE_FEED } from './release-notes-demo.js';
import { registerAppearanceRoutes } from './routes/appearance.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { createMonitoringTrustStore } from './monitoring/index.js';
import { registerMonitoringTrustRoutes } from './routes/monitoring-trust.js';

export const HEALTH_PATH = '/api/health';
/** The monitor ticks every 10 seconds; this many without a finished cycle means it stopped. */
const MONITOR_STALE_MS = 120_000;

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
    /** Process logger (see `createLogger`). Without one the application logs nothing, as in tests. */
    logger?: FastifyBaseLogger;
  } = {},
) {
  const serverOptions: FastifyServerOptions = {
    bodyLimit: 100_000,
    trustProxy: options.trustProxy === true,
    ...(options.logger
      ? {
          loggerInstance: options.logger,
          logController: new LogController({ disableRequestLogging: isQuietRequest }),
        }
      : {}),
  };
  const app = Fastify(serverOptions);
  const log = app.log;
  const startedAt = Date.now();
  const sqlite = getSqliteHandle(db);
  const configuration = createServiceConfiguration(sqlite);
  const monitoringTrust = createMonitoringTrustStore(sqlite);
  const audit = createAuditLog(sqlite, Date.now, log);
  const appearance = createAppearance(sqlite);
  const customCss = createCustomCss(sqlite);
  const proposals = createProposalService(sqlite, configuration);
  const rollup = createRollupStore(sqlite);
  const observations = createObservationStore(sqlite, rollup);
  const notifications = createNotifications(sqlite, vault, log);
  const inbox = createInbox(sqlite);
  inbox.prune();
  const incidents = createIncidentStore(sqlite, (transition) => {
    log.info(
      {
        incident: transition.incidentId,
        service: transition.serviceId,
        reason: transition.reason,
        ...(transition.httpStatus === null ? {} : { httpStatus: transition.httpStatus }),
      },
      transition.kind === 'down' ? 'incident opened' : 'incident closed',
    );
    inbox.record(transition);
  });
  const measurement = createMeasurementGuard(sqlite, (transition) => {
    const { incident } = transition;
    log.warn(
      {
        measurementIncident: incident.id,
        reason: incident.reason,
        failing: incident.failing,
        measured: incident.measured,
      },
      transition.kind === 'down'
        ? 'monitoring cannot measure: service failures are held back'
        : 'monitoring measures again',
    );
    try {
      inbox.recordMeasurement(transition);
    } catch (error) {
      log.error({ err: error }, 'could not record the measurement failure in the inbox');
    }
    audit.record({
      actor: SYSTEM_ACTOR,
      action: 'monitoring-measurement',
      result: transition.kind === 'down' ? 'failed' : 'ok',
      detail: `${incident.reason}:${incident.failing}/${incident.measured}`,
    });
  });
  const maintenance = createMaintenanceStore(sqlite);
  const tagStore = createTagStore(sqlite);
  // An old backend process may have stopped without clearing its last observation.
  observations.clear();
  const monitoringSource = createMonitoringSource(sqlite);
  const degradedSince = createDegradedSince(sqlite);
  const serviceMonitor = createServiceMonitor(
    async () => monitoringSource.list(),
    undefined,
    undefined,
    (rows, states) => {
      // Each step is isolated: a failure in one must not stop the others, but it is never silent.
      try {
        observations.publish(rows, states);
      } catch (error) {
        log.error({ err: error }, 'could not publish service observations');
      }
      // What the monitor measured is kept as it is, but a failure that is the measurer's must not
      // become alerts or incidents of the services: those two see the masked states.
      let judged = states;
      try {
        measurement.observe(rows, states);
        judged = measurement.mask(states);
      } catch (error) {
        log.error({ err: error }, 'could not evaluate whether monitoring can measure');
      }
      try {
        degradedSince.observe(rows, judged);
      } catch (error) {
        log.error({ err: error }, 'could not track observed latency degradation');
      }
      try {
        notifications.publish(rows, judged);
      } catch (error) {
        log.error({ err: error }, 'could not queue status notifications');
      }
      try {
        incidents.observe(rows, judged);
      } catch (error) {
        log.error({ err: error }, 'could not update incidents');
      }
    },
    (at) => {
      try {
        return new Set(maintenance.active(at).keys());
      } catch (error) {
        log.error({ err: error }, 'could not read maintenance windows; checking every service');
        return new Set<number>();
      }
    },
    () => {
      try {
        return monitoringTrust.read().trust;
      } catch (error) {
        log.error({ err: error }, 'could not read the monitoring trust bundle');
        return null;
      }
    },
    log,
  );
  registerMonitoringTrustRoutes(app, monitoringTrust, serviceMonitor, auth, audit);
  try {
    rollup.backfill();
  } catch (error) {
    // The long-range charts stay empty; checks keep working.
    log.error({ err: error }, 'could not backfill the uptime rollup');
  }
  const publicStatus = createPublicStatus(sqlite, observations, measurement);
  try {
    incidents.rebuildFromHistory(monitoringSource.list());
  } catch (error) {
    // Incidents are auxiliary: the dashboard stays usable without them.
    log.error({ err: error }, 'could not rebuild incidents from history');
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
      !(request.method === 'GET' && request.url.split('?')[0] === HEALTH_PATH) &&
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

  const releaseNotes = createReleaseNotes();
  app.get('/api/release-notes', async (_request, reply) => {
    if (options.developmentMocks === true) return { feed: DEMO_RELEASE_FEED, demo: true };
    const feed = await releaseNotes();
    return feed === null
      ? reply.code(503).send(errorBody('internal-error'))
      : { feed, demo: false };
  });

  const build = buildInfo();
  app.get(HEALTH_PATH, async (_request, reply) => {
    let database: 'ok' | 'error' = 'ok';
    let schemaVersion: number | null = null;
    try {
      schemaVersion = Number(
        (sqlite.prepare('SELECT COUNT(*) AS n FROM __drizzle_migrations').get() as { n: number }).n,
      );
    } catch (error) {
      database = 'error';
      log.error({ err: error }, 'health check: database is not readable');
    }
    const { lastCycleAt } = serviceMonitor.health();
    const age = lastCycleAt === null ? null : Date.now() - lastCycleAt;
    const monitor =
      age === null
        ? Date.now() - startedAt > MONITOR_STALE_MS
          ? 'stalled'
          : 'starting'
        : age > MONITOR_STALE_MS
          ? 'stalled'
          : 'ok';
    const healthy = database === 'ok' && monitor !== 'stalled';
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'unhealthy',
      version: build.version,
      commit: build.commit,
      releaseTag: build.releaseTag,
      schemaVersion,
      database,
      monitor: {
        status: monitor,
        lastCycleAgeSeconds: age === null ? null : Math.round(age / 1000),
      },
    });
  });

  app.get('/', async (_req, reply) => reply.redirect(`http://localhost:${webPort}/`));
  registerAuthRoutes(app, auth, webPort, audit);
  registerAccountRoutes(app, auth, audit);
  app.get('/api/integrations/catalog', async () => integrationRegistry.describe());
  const connections = registerConnectionRoutes(app, db, vault, options.developmentMocks === true);
  registerNotificationRoutes(app, notifications);
  registerInboxRoutes(app, inbox);
  registerPageRoutes(app, createPages(sqlite), auth, audit);
  registerPageWidgetRoutes(app, sqlite);
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
  registerServiceIncidentRoutes(app, incidents, observations, measurement, auth, audit);
  registerWidgetMonitoringRoutes(
    app,
    sqlite,
    monitoringSource,
    serviceMonitor,
    incidents,
    measurement,
    degradedSince,
  );
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
    createServiceAttention(sqlite),
  );
  registerProbeRoutes(app, createProbeStore(sqlite), serviceMonitor, auth, audit);
  registerServiceLinkTypeRoutes(app, configuration);
  registerHostSuggestionRoutes(app, sqlite, connections, configuration);
  registerServiceDependencyRoutes(app, sqlite, auth, audit);
  registerResourceLinkRoutes(app, sqlite, auth, audit);
  registerConfigTransferRoutes(app, configuration, serviceMonitor, {
    appearance,
    customCss,
  });
  registerDiscoveryRoutes(app, configuration, serviceMonitor, dockerSource);
  registerDockerPushRoutes(app, createDockerPush(sqlite), configuration, serviceMonitor, auth);

  app.setErrorHandler((error, request, reply) => {
    const status =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status >= 500) {
      // The client only learns `internal-error`; the original error stays in the log.
      request.log.error(
        {
          err: error,
          method: request.method,
          url: request.url.split('?')[0],
          route: request.routeOptions.url ?? null,
        },
        'request failed',
      );
      return reply.code(status).send(errorBody('internal-error'));
    }
    return reply.send(error);
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send(errorBody('not-found')));
  return app;
}
