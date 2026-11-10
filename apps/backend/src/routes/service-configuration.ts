import type { FastifyInstance } from 'fastify';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';
import {
  groupNameSchema,
  groupOrderSchema,
  parseId,
  serviceInputSchema,
  serviceOrderSchema,
} from '../input-schemas.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;
type Monitor = ReturnType<typeof createServiceMonitor>;
const publicService = <T extends { allowPrivate: number | boolean }>(row: T) => ({
  ...row,
  allowPrivate: Boolean(row.allowPrivate),
});

export function registerServiceConfigurationRoutes(
  app: FastifyInstance,
  configuration: Configuration,
  monitor: Monitor,
) {
  app.get('/api/services', async () => configuration.listServices());
  app.get('/api/service-status', async () => monitor.snapshot());
  app.get('/api/groups', async () => configuration.listGroups());

  app.post('/api/groups', async (request, reply) => {
    const parsed = groupNameSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Informe um nome de grupo com até 40 caracteres.' });
    try {
      return reply.code(201).send(configuration.createGroup(parsed.data.name));
    } catch {
      return reply.code(409).send({ error: 'Já existe um grupo com esse nome.' });
    }
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ error: 'Grupo não encontrado.' });
    const parsed = groupNameSchema.safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'Informe um nome de grupo com até 40 caracteres.' });
    try {
      const updated = configuration.renameGroup(id, parsed.data.name);
      return updated ?? reply.code(404).send({ error: 'Grupo não encontrado.' });
    } catch {
      return reply.code(409).send({ error: 'Já existe um grupo com esse nome.' });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ error: 'Grupo não encontrado.' });
    const result = configuration.deleteGroup(id);
    if (result === 'missing') return reply.code(404).send({ error: 'Grupo não encontrado.' });
    if (result === 'not-empty')
      return reply
        .code(409)
        .send({ error: 'Mova ou remova os cards deste grupo antes de excluí-lo.' });
    return { deleted: true };
  });

  app.put('/api/groups/order', async (request, reply) => {
    const parsed = groupOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ordem de grupos inválida.' });
    return configuration.reorderGroups(parsed.data.names)
      ? { ok: true }
      : reply.code(400).send({ error: 'Ordem de grupos inválida.' });
  });

  app.put('/api/services/order', async (request, reply) => {
    const parsed = serviceOrderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ordem de cards inválida.' });
    return configuration.reorderServices(parsed.data.category, parsed.data.ids)
      ? { ok: true }
      : reply.code(400).send({ error: 'Ordem de cards inválida.' });
  });

  app.post('/api/services', async (request, reply) => {
    const parsed = serviceInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    try {
      const created = configuration.createService(parsed.data);
      void monitor.invalidate();
      return reply.code(201).send(publicService(created));
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Dados inválidos.' });
    }
  });

  app.put<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ error: 'Serviço não encontrado.' });
    const parsed = serviceInputSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Dados inválidos.' });
    try {
      const updated = configuration.updateService(id, parsed.data);
      if (!updated) return reply.code(404).send({ error: 'Serviço não encontrado.' });
      void monitor.invalidate();
      return publicService(updated);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Dados inválidos.' });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send({ deleted: false });
    const deleted = configuration.deleteService(id);
    if (deleted) void monitor.invalidate();
    return reply.code(deleted ? 200 : 404).send({ deleted });
  });
}
