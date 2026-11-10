import type { FastifyInstance } from 'fastify';
import { createDatabase } from '@homora/db';
import { createVault } from '../vault.js';
import { createIntegrationConnections } from '../integration-connections.js';
import {
  createConnectionSchema,
  createWidgetSchema,
  parseId,
  refreshQuerySchema,
  updateConnectionSchema,
} from '../input-schemas.js';
import { InputError, errorBody } from '../api-error.js';

type Db = ReturnType<typeof createDatabase>['db'];
type Vault = ReturnType<typeof createVault>;

function connectionInputError(error: unknown) {
  return errorBody(error instanceof InputError ? error.code : 'integration-save-failed');
}

export function registerConnectionRoutes(app: FastifyInstance, db: Db, vault?: Vault) {
  const connections = createIntegrationConnections(db, vault);

  app.get('/api/connections', async () => connections.listConnections());
  app.get('/api/widgets', async () => connections.listWidgets());

  app.post('/api/widgets', async (request, reply) => {
    const parsed = createWidgetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-widget'));
    const widget = await connections.createWidget(parsed.data.integrationId, parsed.data.name);
    if (!widget) return reply.code(404).send(errorBody('integration-not-found'));
    return reply.code(201).send(widget);
  });

  app.delete<{ Params: { id: string } }>('/api/widgets/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('widget-not-found'));
    return (await connections.deleteWidget(id))
      ? { ok: true }
      : reply.code(404).send(errorBody('widget-not-found'));
  });

  app.post('/api/connections', async (request, reply) => {
    const parsed = createConnectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      return reply.code(201).send(await connections.createConnection(parsed.data));
    } catch (error) {
      return reply.code(400).send(connectionInputError(error));
    }
  });

  app.put<{ Params: { id: string } }>('/api/connections/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('integration-not-found'));
    const parsed = updateConnectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    try {
      const updated = await connections.updateConnection(id, parsed.data);
      return updated ?? reply.code(404).send(errorBody('integration-not-found'));
    } catch (error) {
      return reply.code(400).send(connectionInputError(error));
    }
  });

  app.delete<{ Params: { id: string } }>('/api/connections/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('integration-not-found'));
    const result = await connections.deleteConnection(id);
    if (result === 'missing') return reply.code(404).send(errorBody('integration-not-found'));
    if (result === 'has-widgets') return reply.code(409).send(errorBody('integration-has-widgets'));
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    '/api/connections/:id/data',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('integration-not-found'));
      const query = refreshQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
      try {
        const result = await connections.connectionData(id, query.data.refresh === 'true');
        return result ?? reply.code(404).send(errorBody('integration-not-found'));
      } catch {
        return reply.code(502).send(errorBody('integration-query-failed'));
      }
    },
  );

  app.post<{ Params: { id: string } }>('/api/connections/:id/test', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('integration-not-found'));
    try {
      return (await connections.testConnection(id))
        ? { ok: true }
        : reply.code(404).send(errorBody('integration-not-found'));
    } catch {
      return reply.code(502).send(errorBody('integration-test-failed'));
    }
  });
}
