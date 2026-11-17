import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { createDatabase } from '@homora/db';
import { AGENT_SCOPES } from '../agents/agent-scopes.js';
import { createIpRateLimiter } from '../rate-limit.js';
import { createMcp } from './index.js';
import { createIntegrationConnections } from '../integrations/integration-connections.js';
import type { createProposalService } from '../proposals/index.js';
import type { createVault } from '../vault.js';
import type { DockerSource } from '../discovery/index.js';

export function registerMcpHttp(
  app: FastifyInstance,
  sqlite: DatabaseSync,
  proposals: ReturnType<typeof createProposalService>,
  vault: ReturnType<typeof createVault> | undefined,
  db: ReturnType<typeof createDatabase>['db'],
  docker: DockerSource | undefined,
  origins: Set<string>,
  apiPort: number,
) {
  const hosts = new Set([...origins].map((origin) => new URL(origin).host));
  hosts.add(`localhost:${apiPort}`);
  hosts.add(`127.0.0.1:${apiPort}`);
  const allowIp = createIpRateLimiter({ max: 120 });
  app.post('/mcp', async (request, reply) => {
    if (!allowIp(request.ip)) return reply.code(429).send({ error: 'Too many requests' });
    if (!request.headers.host || !hosts.has(request.headers.host))
      return reply.code(403).send({ error: 'Host not allowed' });
    if (request.headers.origin && !origins.has(request.headers.origin))
      return reply.code(403).send({ error: 'Origin not allowed' });
    const token = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token || !AGENT_SCOPES.some((scope) => proposals.authenticate(token, scope)))
      return reply.code(401).send({ error: 'Authentication required' });
    if (!vault) return reply.code(503).send({ error: 'MCP unavailable' });
    const server = createMcp(sqlite, {
      token,
      connections: createIntegrationConnections(db, vault),
      docker,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch {
      if (!reply.raw.headersSent) reply.raw.writeHead(500, { 'content-type': 'application/json' });
      if (!reply.raw.writableEnded) reply.raw.end();
    } finally {
      await transport.close();
      await server.close();
    }
  });
}
