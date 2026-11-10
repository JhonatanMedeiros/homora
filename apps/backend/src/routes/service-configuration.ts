import type { FastifyInstance } from 'fastify';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { createServiceMonitor } from '../service-monitor.js';

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
    const name = (request.body as { name?: unknown } | null)?.name;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40)
      return reply.code(400).send({ error: 'Informe um nome de grupo com até 40 caracteres.' });
    try {
      return reply.code(201).send(configuration.createGroup(name.trim()));
    } catch {
      return reply.code(409).send({ error: 'Já existe um grupo com esse nome.' });
    }
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    const name = (request.body as { name?: unknown } | null)?.name;
    if (!/^\d+$/.test(request.params.id))
      return reply.code(404).send({ error: 'Grupo não encontrado.' });
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40)
      return reply.code(400).send({ error: 'Informe um nome de grupo com até 40 caracteres.' });
    try {
      const updated = configuration.renameGroup(Number(request.params.id), name.trim());
      return updated ?? reply.code(404).send({ error: 'Grupo não encontrado.' });
    } catch {
      return reply.code(409).send({ error: 'Já existe um grupo com esse nome.' });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    if (!/^\d+$/.test(request.params.id))
      return reply.code(404).send({ error: 'Grupo não encontrado.' });
    const result = configuration.deleteGroup(Number(request.params.id));
    if (result === 'missing') return reply.code(404).send({ error: 'Grupo não encontrado.' });
    if (result === 'not-empty')
      return reply
        .code(409)
        .send({ error: 'Mova ou remova os cards deste grupo antes de excluí-lo.' });
    return { deleted: true };
  });

  app.put('/api/groups/order', async (request, reply) => {
    const names = (request.body as { names?: unknown } | null)?.names;
    if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
      return reply.code(400).send({ error: 'Ordem de grupos inválida.' });
    return configuration.reorderGroups(names)
      ? { ok: true }
      : reply.code(400).send({ error: 'Ordem de grupos inválida.' });
  });

  app.put('/api/services/order', async (request, reply) => {
    const body = request.body as { category?: unknown; ids?: unknown } | null;
    if (
      typeof body?.category !== 'string' ||
      !Array.isArray(body.ids) ||
      body.ids.some((id) => !Number.isSafeInteger(id))
    )
      return reply.code(400).send({ error: 'Ordem de cards inválida.' });
    return configuration.reorderServices(body.category, body.ids as number[])
      ? { ok: true }
      : reply.code(400).send({ error: 'Ordem de cards inválida.' });
  });

  app.post('/api/services', async (request, reply) => {
    try {
      const created = configuration.createService(request.body ?? {});
      void monitor.invalidate();
      return reply.code(201).send(publicService(created));
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : 'Dados inválidos.' });
    }
  });

  app.put<{ Params: { id: string } }>('/api/services/:id', async (request, reply) => {
    if (!/^\d+$/.test(request.params.id))
      return reply.code(404).send({ error: 'Serviço não encontrado.' });
    try {
      const updated = configuration.updateService(Number(request.params.id), request.body ?? {});
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
    if (!/^\d+$/.test(request.params.id)) return reply.code(404).send({ deleted: false });
    const deleted = configuration.deleteService(Number(request.params.id));
    if (deleted) void monitor.invalidate();
    return reply.code(deleted ? 200 : 404).send({ deleted });
  });
}
