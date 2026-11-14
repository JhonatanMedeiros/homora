import type { FastifyInstance } from 'fastify';
import type { createServiceConfiguration } from '../service-configuration.js';
import type { LinkTypeFailure } from '../service-link-configuration.js';
import { errorBody } from '../api-error.js';
import { linkTypeCreateSchema, linkTypeUpdateSchema, parseId } from '../input-schemas.js';

type Configuration = ReturnType<typeof createServiceConfiguration>;

const STATUS: Record<LinkTypeFailure, number> = {
  'invalid-link-type': 400,
  'link-type-not-found': 404,
  'link-type-exists': 409,
  'link-type-limit': 409,
};

/**
 * Types of extra address (name and color), shared by every service: list with usage, create,
 * edit, delete. Deleting keeps the addresses that used the type; they just lose it.
 */
export function registerServiceLinkTypeRoutes(app: FastifyInstance, configuration: Configuration) {
  app.get('/api/link-types', async () => configuration.listLinkTypes());

  app.post('/api/link-types', async (request, reply) => {
    const body = linkTypeCreateSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-link-type'));
    const result = configuration.createLinkType(body.data.name, body.data.color);
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    return reply.code(201).send({ ...result.value, uses: 0 });
  });

  app.put<{ Params: { id: string } }>('/api/link-types/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('link-type-not-found'));
    const body = linkTypeUpdateSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(errorBody('invalid-link-type'));
    const result = configuration.updateLinkType(id, body.data);
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    return result.value;
  });

  app.delete<{ Params: { id: string } }>('/api/link-types/:id', async (request, reply) => {
    const id = parseId(request.params.id);
    if (id === null) return reply.code(404).send(errorBody('link-type-not-found'));
    const result = configuration.removeLinkType(id);
    if (!result.ok) return reply.code(STATUS[result.code]).send(errorBody(result.code));
    return { deleted: true, uses: result.value.uses };
  });
}
