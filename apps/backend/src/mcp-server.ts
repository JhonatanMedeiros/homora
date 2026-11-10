import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDatabase, getSqliteHandle } from '@homora/db';
import { loadConfig } from './config.js';
import { createVault } from './vault.js';
import { createMcp } from './mcp.js';
const config = loadConfig();
const storage = createDatabase(config.databasePath);
const server = createMcp(getSqliteHandle(storage.db), createVault(config.databasePath));
await server.connect(new StdioServerTransport());
