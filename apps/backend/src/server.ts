import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createDatabase, getSqliteHandle, MigrationHistoryError } from '@homora/db';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDockerSource } from './discovery/index.js';
import { createAuth, loadSessionSecret } from './auth.js';
import { createVault } from './vault.js';
import { migrateLegacyConnectionsAtStartup } from './legacy-integrations.js';
import { createShutdownHandler, installFatalErrorHandlers } from './shutdown.js';
import { buildInfo, createLogger } from './logger.js';
const config = loadConfig();
// One logger for the whole process, available before the application exists so that startup
// problems (migrations, configuration) are logged too.
const log = createLogger({ level: config.logLevel });
const build = buildInfo();
// Replaced once the application exists; before that there is nothing to drain.
let closeApp: () => Promise<void> = async () => undefined;
const shutdown = createShutdownHandler({
  close: () => closeApp(),
  exit: (code) => process.exit(code),
  log: (message) => log.info(message),
});
installFatalErrorHandlers({
  logFatal: (error, event) => log.fatal({ err: error, event }, 'unrecoverable error'),
  shutdown: (signal, code) => shutdown(signal, code),
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => void shutdown(signal));
await mkdir(dirname(config.databasePath), { recursive: true });
let database: ReturnType<typeof createDatabase>;
try {
  database = createDatabase(config.databasePath);
} catch (error) {
  if (error instanceof MigrationHistoryError)
    log.fatal(
      { err: error, databasePath: config.databasePath, ...error.details, version: build.version },
      error.details.reason === 'schema-ahead'
        ? 'database was written by a newer Homora build; refusing to start'
        : 'database migration history differs from this build; refusing to start',
    );
  else log.fatal({ err: error, databasePath: config.databasePath }, 'database migration failed');
  process.exit(1);
}
log.info(
  {
    migrations: database.migrations,
    databasePath: config.databasePath,
  },
  database.migrations.appliedNow > 0
    ? `applied ${database.migrations.appliedNow} database migration(s)`
    : 'database schema is up to date',
);
const vault = createVault(config.databasePath);
migrateLegacyConnectionsAtStartup(database.db, vault);
const app = createApp(
  database.db,
  config.webPort,
  createAuth({
    sqlite: getSqliteHandle(database.db),
    secret: loadSessionSecret(`${config.databasePath}.session-secret`, config.sessionSecret),
    webPort: config.webPort,
    allowedOrigins: config.allowedOrigins,
    passkeyRpId: config.passkeyRpId,
  }),
  vault,
  config.allowedOrigins,
  config.dockerHost ? createDockerSource(config.dockerHost) : undefined,
  {
    trustProxy: config.trustProxy,
    developmentMocks: config.developmentMocks,
    apiPort: config.apiPort,
    // Next to the database, so a backup of the database can take the picture along.
    backgroundPath: `${config.databasePath}.background`,
    logger: log,
  },
);
app.addHook('onClose', async () => database.close());
await app.listen({ port: config.apiPort, host: config.bindHost });
closeApp = () => app.close();
log.info(
  {
    version: build.version,
    commit: build.commit,
    node: process.version,
    bindHost: config.bindHost,
    apiPort: config.apiPort,
    webPort: config.webPort,
    databasePath: config.databasePath,
    logLevel: config.logLevel,
    schemaMigrations: database.migrations.known,
    flags: {
      docker: config.dockerHost !== undefined,
      trustProxy: config.trustProxy,
      developmentMocks: config.developmentMocks,
      allowedOrigins: config.allowedOrigins.length,
      customSessionSecret: config.sessionSecret !== undefined,
    },
  },
  `Homora API listening on port ${config.apiPort}. Access Homora at http://localhost:${config.webPort}`,
);
