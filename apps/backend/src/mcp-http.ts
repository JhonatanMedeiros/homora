import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { createDatabase } from '@homora/db';
import { AGENT_SCOPES } from './agent-scopes.js';
import { createMcp } from './mcp.js';
import { createIntegrationConnections } from './integration-connections.js';
import type { createProposalService } from './proposals.js';
import type { createVault } from './vault.js';
import type { DockerSource } from './docker-discovery.js';

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
  const attempts = new Map<string, { count: number; until: number }>();
  app.post('/mcp', async (request, reply) => {
    const now = Date.now();
    for (const [ip, entry] of attempts) if (entry.until <= now) attempts.delete(ip);
    if (!attempts.has(request.ip) && attempts.size >= 10_000)
      return reply.code(429).send({ error: 'Too many requests' });
    const entry = attempts.get(request.ip) ?? { count: 0, until: now + 60_000 };
    entry.count++;
    attempts.set(request.ip, entry);
    if (entry.count > 120) return reply.code(429).send({ error: 'Too many requests' });
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
