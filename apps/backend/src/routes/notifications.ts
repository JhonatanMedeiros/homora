import type { FastifyInstance } from 'fastify';
import type { createNotifications } from '../notifications.js';
import { parseId } from '../input-schemas.js';
import { errorBody } from '../api-error.js';

export function registerNotificationRoutes(
  app: FastifyInstance,
  notifications: ReturnType<typeof createNotifications>,
) {
  app.get('/api/notifications/channels', async () => notifications.list());
  app.post('/api/notifications/channels', async (request, reply) => {
    try {
      return reply.code(201).send(notifications.save(request.body));
    } catch {
      return reply.code(400).send(errorBody('invalid-data'));
    }
  });
  app.put<{ Params: { id: string } }>('/api/notifications/channels/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('not-found'));
    try {
      return notifications.save(request.body, id) ?? reply.code(404).send(errorBody('not-found'));
    } catch {
      return reply.code(400).send(errorBody('invalid-data'));
    }
  });
  app.delete<{ Params: { id: string } }>(
    '/api/notifications/channels/:id',
    async (request, reply) => {
      const id = parseId(request.params.id);
      return id !== null && notifications.remove(id)
        ? { ok: true }
        : reply.code(404).send(errorBody('not-found'));
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/notifications/channels/:id/test',
    async (request, reply) => {
      const id = parseId(request.params.id);
      if (id === null) return reply.code(404).send(errorBody('not-found'));
      try {
        const result = await notifications.test(id);
        if (result === undefined) return reply.code(404).send(errorBody('not-found'));
        return result === null ? { ok: true } : reply.code(502).send({ ok: false, error: result });
      } catch {
        return reply.code(502).send({ ok: false, error: 'Delivery failed' });
      }
    },
  );
}
