import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDockerSource } from './docker-discovery.js';
import { createAuth, loadSessionSecret } from './auth.js';
import { createVault } from './vault.js';
import { createShutdownHandler } from './shutdown.js';
const config = loadConfig();
await mkdir(dirname(config.databasePath), { recursive: true });
const database = createDatabase(config.databasePath);
const app = createApp(
  database.db,
  config.webPort,
  createAuth({
    sqlite: getSqliteHandle(database.db),
    secret: loadSessionSecret(`${config.databasePath}.session-secret`, config.sessionSecret),
    webPort: config.webPort,
    allowedOrigins: config.allowedOrigins,
  }),
  createVault(config.databasePath),
  config.allowedOrigins,
  config.dockerHost ? createDockerSource(config.dockerHost) : undefined,
  { trustProxy: config.trustProxy },
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
