import type { FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { createHostSuggestions } from '../host-suggestions.js';
import type { createIntegrationConnections } from '../integration-connections.js';
import type { createServiceConfiguration } from '../service-configuration.js';
import { dismissalBodySchema, parseId } from '../input-schemas.js';
import { errorBody } from '../api-error.js';

/**
 * Suggested hosts for cards without one. Authenticated sessions only (the `/api/` hook): guest
 * names and addresses never reach the public status page. Nothing here writes to external systems, and
 * accepting a suggestion is the ordinary `PUT /api/services/:id/host`.
 */
export function registerHostSuggestionRoutes(
  app: FastifyInstance,
  sqlite: DatabaseSync,
  connections: ReturnType<typeof createIntegrationConnections>,
  configuration: ReturnType<typeof createServiceConfiguration>,
) {
  const suggestions = createHostSuggestions({
    sqlite,
    connections,
    listServices: () => configuration.listServices(),
    listHosts: configuration.listHosts,
  });
  app.get('/api/host-suggestions', async (_request, reply) => {
    try {
      return await suggestions.list();
    } catch {
      return reply.code(502).send(errorBody('integration-query-failed'));
    }
  });
  app.put<{ Params: { id: string } }>(
    '/api/services/:id/host-suggestion-dismissal',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('service-not-found'));
      const parsed = dismissalBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
      return suggestions.setDismissed(id, parsed.data.host, parsed.data.dismissed)
        ? { dismissed: parsed.data.dismissed }
        : reply.code(404).send(errorBody('service-not-found'));
    },
  );
}
