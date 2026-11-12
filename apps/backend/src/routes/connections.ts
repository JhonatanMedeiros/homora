import type { FastifyInstance } from 'fastify';
import { createDatabase } from '@homora/db';
import { createVault } from '../vault.js';
import { createIntegrationConnections } from '../integration-connections.js';
import {
  createConnectionSchema,
  createWidgetSchema,
  updateWidgetSchema,
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
    let widget;
    try {
      widget = await connections.createWidget(
        parsed.data.source
          ? { source: parsed.data.source }
          : { integrationId: parsed.data.integrationId! },
        parsed.data.name,
        parsed.data.serviceId ?? null,
      );
    } catch (error) {
      return reply
        .code(error instanceof InputError && error.code === 'proxmox-not-configured' ? 404 : 502)
        .send(errorBody(error instanceof InputError ? error.code : 'integration-save-failed'));
    }
    if (widget === 'service-missing') return reply.code(404).send(errorBody('service-not-found'));
    if (!widget) return reply.code(404).send(errorBody('integration-not-found'));
    return reply.code(201).send(widget);
  });

  app.patch<{ Params: { id: string } }>('/api/widgets/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('widget-not-found'));
    const parsed = updateWidgetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const widget = await connections.setWidgetService(id, parsed.data.serviceId);
    if (widget === 'service-missing') return reply.code(404).send(errorBody('service-not-found'));
    return widget ?? reply.code(404).send(errorBody('widget-not-found'));
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

  // Names and ids of nodes and guests: authenticated sessions only (the /api/ hook), never part of
  // the public status page, and not exposed through MCP in this release.
  app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    '/api/connections/:id/guests',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('integration-not-found'));
      const query = refreshQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
      try {
        const result = await connections.inventoryData(id, query.data.refresh === 'true');
        if (result === null) return reply.code(404).send(errorBody('integration-not-found'));
        if (result === 'not-proxmox') return reply.code(400).send(errorBody('invalid-data'));
        return result;
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
