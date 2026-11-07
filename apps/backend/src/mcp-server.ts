import { DatabaseSync } from 'node:sqlite';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createVault } from './vault.js';
import { createMcp } from './mcp.js';
const config = loadConfig();
const database = new DatabaseSync(config.databasePath, { readOnly: true });
const server = createMcp(database, createVault(config.databasePath));
await server.connect(new StdioServerTransport());
