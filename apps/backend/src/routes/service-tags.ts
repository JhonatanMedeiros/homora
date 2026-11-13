import type { FastifyInstance } from 'fastify';
import { TAGS_MAX_PER_SERVICE, type TagsOverview } from '@homora/shared';
import { z } from 'zod';
import { errorBody } from '../api-error.js';
import { parseId } from '../input-schemas.js';
import type { TagStore } from '../service-tags.js';

const tagsSchema = z
  .object({ tags: z.array(z.string().max(80)).max(TAGS_MAX_PER_SERVICE * 2) })
  .strict();

export function registerServiceTagRoutes(app: FastifyInstance, tags: TagStore) {
  app.get('/api/tags', async (): Promise<TagsOverview> => ({ tags: tags.all() }));
  app.put<{ Params: { id: string } }>('/api/services/:id/tags', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('service-not-found'));
    const parsed = tagsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorBody('invalid-data'));
    const saved = tags.set(id, parsed.data.tags);
    if (!saved) return reply.code(404).send(errorBody('service-not-found'));
    return { tags: saved };
  });
}
