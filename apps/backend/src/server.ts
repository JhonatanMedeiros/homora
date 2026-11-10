import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createDatabase } from '@homora/db';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDockerSource } from './docker-discovery.js';
import { createAuth } from './auth.js';
import { createVault } from './vault.js';
const config = loadConfig();
await mkdir(dirname(config.databasePath), { recursive: true });
const database = createDatabase(config.databasePath);
const app = createApp(
  database.db,
  config.webPort,
  createAuth(`${config.databasePath}.auth`),
  createVault(config.databasePath),
  config.allowedOrigins,
  config.dockerHost ? createDockerSource(config.dockerHost) : undefined,
);
app.addHook('onClose', async () => database.close());
await app.listen({ port: config.apiPort, host: config.bindHost });
console.log(
  `API na porta ${config.apiPort}. Acesse o Homora em http://localhost:${config.webPort}`,
);
