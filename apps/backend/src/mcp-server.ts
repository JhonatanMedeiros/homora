import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { loadConfig } from './config.js';
import { createVault } from './vault.js';
import { createMcp } from './mcp.js';
import { createIntegrationConnections } from './integration-connections.js';
import { createDockerSource } from './discovery/index.js';
const config = loadConfig();
const storage = createDatabase(config.databasePath);
const vault = createVault(config.databasePath);
const server = createMcp(getSqliteHandle(storage.db), {
  connections: createIntegrationConnections(storage.db, vault),
  docker: config.dockerHost ? createDockerSource(config.dockerHost) : undefined,
});
await server.connect(new StdioServerTransport());
