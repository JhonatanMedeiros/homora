import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createInbox } from '../inbox.js';
import { parseId } from '../input-schemas.js';
import { errorBody } from '../api-error.js';

const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    before: z.coerce.number().int().positive().optional(),
  })
  .strict();

export function registerInboxRoutes(app: FastifyInstance, inbox: ReturnType<typeof createInbox>) {
  app.get('/api/inbox', async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send(errorBody('invalid-query'));
    return inbox.list(query.data.limit, query.data.before);
  });
  app.post('/api/inbox/read-all', async () => {
    inbox.readAll();
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>('/api/inbox/:id/read', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null || !inbox.read(id)) return reply.code(404).send(errorBody('not-found'));
    return { ok: true };
  });
}
