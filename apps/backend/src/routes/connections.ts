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

type Db = ReturnType<typeof createDatabase>['db'];
type Vault = ReturnType<typeof createVault>;

function connectionInputError(error: unknown) {
  return error instanceof Error && /^(Informe|Certificado|Dados|Tipo)/.test(error.message)
    ? error.message
    : 'Não foi possível salvar a integração.';
}

export function registerConnectionRoutes(app: FastifyInstance, db: Db, vault?: Vault) {
  const connections = createIntegrationConnections(db, vault);

  app.get('/api/connections', async () => connections.listConnections());
  app.get('/api/widgets', async () => connections.listWidgets());

  app.post('/api/widgets', async (request, reply) => {
    const parsed = createWidgetSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Informe integração e nome válidos.' });
    const widget = await connections.createWidget(parsed.data.integrationId, parsed.data.name);
    if (!widget) return reply.code(404).send({ error: 'Integração não encontrada.' });
    return reply.code(201).send(widget);
  });

  app.delete<{ Params: { id: string } }>('/api/widgets/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ error: 'Widget não encontrado.' });
    return (await connections.deleteWidget(id))
      ? { ok: true }
      : reply.code(404).send({ error: 'Widget não encontrado.' });
  });

  app.post('/api/connections', async (request, reply) => {
    const parsed = createConnectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    try {
      return reply.code(201).send(await connections.createConnection(parsed.data));
    } catch (error) {
      return reply.code(400).send({ error: connectionInputError(error) });
    }
  });

  app.put<{ Params: { id: string } }>('/api/connections/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ error: 'Integração não encontrada.' });
    const parsed = updateConnectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    try {
      const updated = await connections.updateConnection(id, parsed.data);
      return updated ?? reply.code(404).send({ error: 'Integração não encontrada.' });
    } catch (error) {
      return reply.code(400).send({ error: connectionInputError(error) });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/connections/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ error: 'Integração não encontrada.' });
    const result = await connections.deleteConnection(id);
    if (result === 'missing') return reply.code(404).send({ error: 'Integração não encontrada.' });
    if (result === 'has-widgets')
      return reply
        .code(409)
        .send({ error: 'Remova os widgets vinculados antes de excluir a integração.' });
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>(
    '/api/connections/:id/data',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send({ error: 'Integração não encontrada.' });
      const query = refreshQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send({ error: 'Consulta inválida.' });
      try {
        const result = await connections.connectionData(id, query.data.refresh === 'true');
        return result ?? reply.code(404).send({ error: 'Integração não encontrada.' });
      } catch {
        return reply.code(502).send({
          error:
            'Não foi possível consultar a integração. Verifique conexão, permissões e certificado.',
        });
      }
    },
  );

  app.post<{ Params: { id: string } }>('/api/connections/:id/test', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ error: 'Integração não encontrada.' });
    try {
      return (await connections.testConnection(id))
        ? { ok: true }
        : reply.code(404).send({ error: 'Integração não encontrada.' });
    } catch {
      return reply.code(502).send({
        error: 'Não foi possível testar a integração. Verifique conexão, permissões e certificado.',
      });
    }
  });
}
