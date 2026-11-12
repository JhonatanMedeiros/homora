import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDockerSource } from './docker-discovery.js';
import { createAuth, loadSessionSecret } from './auth.js';
import { createVault } from './vault.js';
import { migrateLegacyProxmoxAtStartup } from './integration-connections.js';
import { createShutdownHandler } from './shutdown.js';
const config = loadConfig();
await mkdir(dirname(config.databasePath), { recursive: true });
const database = createDatabase(config.databasePath);
const vault = createVault(config.databasePath);
migrateLegacyProxmoxAtStartup(database.db, vault);
const app = createApp(
  database.db,
  config.webPort,
  createAuth({
    sqlite: getSqliteHandle(database.db),
    secret: loadSessionSecret(`${config.databasePath}.session-secret`, config.sessionSecret),
    webPort: config.webPort,
    allowedOrigins: config.allowedOrigins,
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
  },
);
app.addHook('onClose', async () => database.close());
await app.listen({ port: config.apiPort, host: config.bindHost });
const shutdown = createShutdownHandler({
  close: () => app.close(),
  exit: (code) => process.exit(code),
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, () => void shutdown(signal));
console.log(
  `API listening on port ${config.apiPort}. Access Homora at http://localhost:${config.webPort}`,
);
